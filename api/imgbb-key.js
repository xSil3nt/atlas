export default function handler(req, res) {
  const key = process.env.IMGBB_KEY;
  if (!key) return res.status(500).json({ error: "not configured" });
  res.setHeader("Cache-Control", "private, max-age=300");
  return res.status(200).json({ key });
}
