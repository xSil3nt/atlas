export const MODE_DETAILS = [
  {id:'normal', name:'Normal', detail:'All cards', icon:'M5 8h11v12H5z M9 4h10v12'},
  {id:'pack', name:'Pack mode', detail:'Opened cards', icon:'M6 3h12v18H6z M6 7h12 M6 17h12 M10 10h4v4h-4z'},
  {id:'anarchy', name:'Anarchy', detail:'Unrestricted decks', icon:'M12 12c-3-6-8-5-8 0s5 6 8 0 8-5 8 0-5 6-8 0'},
];
export const MODE_IDS = MODE_DETAILS.map(mode => mode.id);
export function legacyMode(pathname) {
  const path = pathname.replace(/\/$/,'').replace(/\.html$/,'');
  if (['/packs','/packs/index'].includes(path)) return 'pack';
  return path === '/anarchy' ? 'anarchy' : null;
}
export function resolveModeUrl(url) {
  const legacy = legacyMode(url.pathname);
  const query = url.searchParams.get('mode');
  return {legacy: legacy !== null,
    mode: url.hash === '#packs' ? 'pack' : MODE_IDS.includes(query) ? query : legacy,
    openPacks: url.hash === '#packs' || legacy === 'pack'};
}
