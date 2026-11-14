// Atlas and Packs always resolve metadata, card faces and backs from this source.
export const CARDS_BASE = 'https://raw.githubusercontent.com/xSil3nt/lifestitchr-cards/main/';
export const repoUrl = path => CARDS_BASE + path.replaceAll('\\','/').normalize('NFC').split('/').map(encodeURIComponent).join('/');
