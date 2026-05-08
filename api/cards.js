const FOLDER_TO_CODE = {
  Blood: "Bl",
  Heart: "H",
  Brain: "Br",
  Soul: "S",
  Eye: "E",
};

const SINGLE_RESOURCE_FOLDERS = new Set(Object.keys(FOLDER_TO_CODE));
const MULTI_FOLDERS = new Set(["Multi", "Resource"]);

function parseBrackets(filename) {
  const match = filename.match(/\[([^\]]+)\]/);
  if (!match) return [];
  return match[1].split(/\s+/).filter(Boolean);
}

function cardName(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\[[^\]]*\]/, "")
    .trim();
}

function rawUrl(path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/xSil3nt/lifestitchr-cards/main/${encoded}`;
}

export default async function handler(req, res) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  let tree;
  try {
    const r = await fetch(
      "https://api.github.com/repos/xSil3nt/lifestitchr-cards/git/trees/main?recursive=1",
      { headers }
    );
    if (!r.ok) {
      const body = await r.text();
      return res.status(502).json({ error: `GitHub API error ${r.status}`, detail: body });
    }
    const data = await r.json();
    tree = data.tree;
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  const decks = { Blood: [], Heart: [], Brain: [], Soul: [], Eye: [], Multi: [] };
  const resources = [];
  const backs = { main: null, resource: null };

  for (const item of tree) {
    if (item.type !== "blob" || !item.path.endsWith(".png")) continue;

    const parts = item.path.split("/");
    const filename = parts[parts.length - 1];

    if (parts.length === 1) {
      if (filename === "mainback.png") backs.main = rawUrl(item.path);
      else if (filename === "resback.png") backs.resource = rawUrl(item.path);
      continue;
    }

    const folder = parts[0];
    const url = rawUrl(item.path);
    const name = cardName(filename);

    if (SINGLE_RESOURCE_FOLDERS.has(folder)) {
      const code = FOLDER_TO_CODE[folder];
      decks[folder].push({ name, folder, resources: [code], url });
    } else if (folder === "Multi") {
      const res_codes = parseBrackets(filename);
      decks.Multi.push({ name, folder: "Multi", resources: res_codes, url });
    } else if (folder === "Resource") {
      const subfolder = parts.length === 3 ? parts[1] : null;
      if (subfolder !== "Common" && subfolder !== "Peculiar") continue;
      const type = subfolder === "Peculiar" ? "peculiar" : "common";
      const res_codes = parseBrackets(filename);
      resources.push({ name, folder: "Resource", type, resources: res_codes, url });
    }
  }

  for (const key of Object.keys(decks)) {
    decks[key].sort((a, b) => a.name.localeCompare(b.name));
  }
  resources.sort((a, b) => {
    if (a.type !== b.type) return a.type === "common" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  return res.status(200).json({ decks, resources, backs });
}
