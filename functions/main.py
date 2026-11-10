import logging
import uuid
from datetime import datetime, timedelta, timezone

from firebase_admin import initialize_app, firestore
from firebase_functions import https_fn, options, scheduler_fn
from google.cloud.firestore_v1 import transactional

from cadence import decide
from history_archive import fold_public_history
from sync_service import begin_nudge, finish_nudge, run_scheduled

initialize_app()
options.set_global_options(region="us-east1", memory=options.MemoryOption.MB_256,
                           cpu="gcf_gen1", min_instances=0, max_instances=1, concurrency=1, timeout_sec=150)


class FirestoreStore:
    def __init__(self, db):
        self.db = db

    def latest(self, slug):
        snapshot = self.db.collection("publicLeagues").document(slug).get()
        return snapshot.to_dict() if snapshot.exists else None

    def latest_roster(self, slug):
        snapshot = self.db.collection("publicRosters").document(slug).get()
        return snapshot.to_dict() if snapshot.exists else None

    def publish(self, slug, summary, roster):
        batch = self.db.batch()
        batch.set(self.db.collection("publicLeagues").document(slug), summary)
        batch.set(self.db.collection("publicRosters").document(slug), roster)
        batch.commit()

    def latest_live(self, slug):
        snapshot = self.db.collection("publicLive").document(slug).get()
        return snapshot.to_dict() if snapshot.exists else None

    def publish_live(self, slug, document):
        self.db.collection("publicLive").document(slug).set(document)

    def publish_live_week(self, season, slug, week, document):
        self.db.collection("publicLiveWeeks").document(f"{season}-{slug}-{week}").set(document)

    def fold_history(self, summary):
        season = summary.get("season")
        if not isinstance(season, int):
            return
        ref = self.db.collection("publicHistory").document(str(season))
        snapshot = ref.get()
        folded = fold_public_history(snapshot.to_dict() if snapshot.exists else None, summary)
        if folded:
            ref.set(folded)

    def mark_failed(self, slug, stamp):
        # Update only existing snapshots; no incomplete documents on first-run failure.
        batch = self.db.batch()
        for collection in ("publicLeagues", "publicRosters"):
            ref = self.db.collection(collection).document(slug)
            if ref.get().exists:
                batch.update(ref, {"refreshStatus": "error", "lastAttemptAt": stamp})
        batch.commit()

    def slate(self):
        snapshot = self.db.collection("_sync").document("slate").get()
        return snapshot.to_dict() if snapshot.exists else None

    def save_slate(self, document):
        self.db.collection("_sync").document("slate").set(document)

    def audience_seen(self):
        snapshot = self.db.collection("_sync").document("audience").get()
        if not snapshot.exists:
            return None
        return (snapshot.to_dict() or {}).get("lastSeen")

    def mark_audience(self, stamp):
        self.db.collection("_sync").document("audience").set({"lastSeen": stamp})


@transactional
def acquire_lease(transaction, reference, token):
    current = reference.get(transaction=transaction)
    now = datetime.now(timezone.utc)
    if current.exists and current.to_dict().get("expiresAt", now) > now:
        return False
    transaction.set(reference, {"token": token, "expiresAt": now + timedelta(seconds=165)})
    return True


@transactional
def release_lease(transaction, reference, token):
    current = reference.get(transaction=transaction)
    if current.exists and current.to_dict().get("token") == token:
        transaction.delete(reference)


def _run_locked(db, work):
    reference = db.collection("_sync").document("lease")
    token = str(uuid.uuid4())
    if not acquire_lease(db.transaction(), reference, token):
        return False
    try:
        work()
        return True
    finally:
        release_lease(db.transaction(), reference, token)


@scheduler_fn.on_schedule(schedule="every 1 minutes", timezone="America/New_York", retry_count=0)
def refresh_jffl(event: scheduler_fn.ScheduledEvent) -> None:
    del event
    db = firestore.client()
    store = FirestoreStore(db)
    now = datetime.now(timezone.utc)
    if decide(now, store.slate(), store.audience_seen(), "scheduler") == "skip":
        return
    _run_locked(db, lambda: run_scheduled(store))


@https_fn.on_request(invoker="public")
def nudge_jffl(req: https_fn.Request) -> https_fn.Response:
    """An open tab asks for a live tick. The body is ignored and ESPN stays here."""
    if req.method != "POST":
        return https_fn.Response("", status=405)
    try:
        db = firestore.client()
        store = FirestoreStore(db)
        if begin_nudge(store) != "live":
            return https_fn.Response("", status=204)

        def work():
            finish_nudge(store)

        _run_locked(db, work)
    except Exception as error:
        logging.error("JFFL nudge failed (%s)", type(error).__name__)
    return https_fn.Response("", status=204)
