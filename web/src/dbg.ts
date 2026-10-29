// Отладка воркеров MapLibre: включается параметром ?debug
if (location.search.includes('debug')) {
  const OW = window.Worker;
  (window as any).Worker = class extends OW {
    constructor(u: string | URL, o?: WorkerOptions) {
      super(u, o);
      console.log('[dbg] worker', String(u).slice(0, 100), JSON.stringify(o));
      this.addEventListener('error', (e) => console.log('[dbg] werr', e.message, (e as any).filename));
      this.addEventListener('messageerror', () => console.log('[dbg] messageerror'));
      this.addEventListener('message', (e) => console.log('[dbg] wmsg', JSON.stringify(e.data).slice(0, 140)));
      const pm = this.postMessage.bind(this);
      (this as any).postMessage = (m: any, t: any) => {
        console.log('[dbg] post', JSON.stringify(m)?.slice(0, 140));
        return pm(m, t);
      };
    }
  };
}
