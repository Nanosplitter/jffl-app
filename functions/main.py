import uuid
from datetime import datetime, timedelta, timezone

from firebase_admin import initialize_app, firestore
from firebase_functions import options, scheduler_fn
from google.cloud.firestore_v1 import transactional

from sync_service import sync_leagues

initialize_app()
options.set_global_options(region="us-east1", memory=options.MemoryOption.MB_256,
                           cpu="gcf_gen1", min_instances=0, max_instances=1, concurrency=1, timeout_sec=150)


class FirestoreStore:
    def __init__(self, db):
        self.db = db

    def latest(self, slug):
        snapshot = self.db.collection("publicLeagues").document(slug).get()
        return snapshot.to_dict() if snapshot.exists else None

    def publish(self, slug, summary, roster):
        batch = self.db.batch()
        batch.set(self.db.collection("publicLeagues").document(slug), summary)
        batch.set(self.db.collection("publicRosters").document(slug), roster)
        batch.commit()

    def mark_failed(self, slug, stamp):
        # Update only existing snapshots; no incomplete documents on first-run failure.
        batch = self.db.batch()
        for collection in ("publicLeagues", "publicRosters"):
            ref = self.db.collection(collection).document(slug)
            if ref.get().exists:
                batch.update(ref, {"refreshStatus": "error", "lastAttemptAt": stamp})
        batch.commit()


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


@scheduler_fn.on_schedule(schedule="every 3 minutes", timezone="America/New_York", retry_count=0)
def refresh_jffl(event: scheduler_fn.ScheduledEvent) -> None:
    db = firestore.client()
    reference = db.collection("_sync").document("lease")
    token = str(uuid.uuid4())
    if not acquire_lease(db.transaction(), reference, token):
        return
    try:
        sync_leagues(FirestoreStore(db))
    finally:
        release_lease(db.transaction(), reference, token)
