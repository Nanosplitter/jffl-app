import raw from './archive.json';
import { parseArchive, type ArchiveFile } from './stats.ts';

export const history = parseArchive(raw as ArchiveFile);
