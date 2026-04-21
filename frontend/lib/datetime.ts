/** Format alert timestamps for display (ISO or parseable strings). */
export function formatAlertTimestamp(raw: string): string {
  const trimmed = raw.trim();
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  }
  return trimmed;
}

export type RecordingMeta = {
  displayTitle: string;
  recordedAt: Date | null;
  recordedLabel: string | null;
};

/** Parse `recording_YYYYMMDD_HHMMSS.mp4`-style names for title + time. */
export function parseRecordingFilename(filename: string): RecordingMeta {
  const base = filename.replace(/\.[^/.]+$/, "");
  const m = /^recording_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(
    base
  );
  if (m) {
    const [, y, mo, d, h, min, s] = m;
    const iso = `${y}-${mo}-${d}T${h}:${min}:${s}`;
    const recordedAt = new Date(iso);
    if (!Number.isNaN(recordedAt.getTime())) {
      return {
        displayTitle: "Camera recording",
        recordedAt,
        recordedLabel: new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "medium",
        }).format(recordedAt),
      };
    }
  }
  return {
    displayTitle: base || filename,
    recordedAt: null,
    recordedLabel: null,
  };
}
