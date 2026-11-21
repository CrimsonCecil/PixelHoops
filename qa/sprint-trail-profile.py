#!/usr/bin/env python3
"""Paired render-only timings in isolated Chrome; never attaches to existing tabs."""
import argparse
import json
from playwright.sync_api import sync_playwright

RUN = """({mode, alpha, frames}) => {
  const M=PH.game, G=M.G;
  Date.now=()=>7; PH.CS.select('official'); M.seed(7);
  if(mode==='5v5') {
    PH.T5.start({home:'LAL',away:'BOS',human:-1,qlen:300});
    PH.T5.setCam({preset:'2k'});
  } else {
    M.newGame({mode:'train',arch0:'dmitchell',arch1:'herb'});
    Object.assign(G.train,{dummy:'none',role:'off',infStam:true}); M.applyTrain(); M.giveBall();
    Object.assign(G,{intro:null,tips:null,chk:null,phase:'live',state:'play'});
    Object.assign(G.players[0],{x:0,y:6});
    PH.input.read=()=>({...M.t5.zeroInp(),mx:Math.cos(G.time*2),my:Math.sin(G.time*2),sprint:true});
  }
  trailProfileScreen(mode); PH.TUNE.set('l1_fxTrailAlpha',alpha);
  const R=mode==='5v5'?PH.render5:PH.render, original=R.render;
  let elapsed=0, count=0, runners=0, measuring=false;
  R.render=function(...args) {
    // Count the players eligible for the effect, not all ten bodies.
    if(measuring) runners+=G.players.filter(p=>p.anim==='run'&&!p.off&&p.speed>0.9&&PH.gait.spW(p)>.15).length;
    const start=performance.now(); const result=original.apply(this,args);
    if(measuring){elapsed+=performance.now()-start;count++;} return result;
  };
  try {
    for(let i=0;i<120;i++) advanceTime(1000/60);
    measuring=true;
    for(let i=0;i<frames;i++) advanceTime(1000/60);
  } finally {R.render=original;}
  return {mode,alpha,frames:count,ms:elapsed/count,runners:runners/count,
    state:JSON.stringify({time:G.time,players:G.players.map(p=>[p.x,p.y,p.speed,p.runPh]),ball:G.ball,score:G.score})};
}"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frames', type=int, default=240)
    parser.add_argument('--rounds', type=int, default=4)
    args = parser.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/home/ubuntu/.local/bin/google-chrome',
                                    headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1280, 'height': 720})
        page.add_init_script("""Date.now=()=>7; let seed=7;
          Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
          window.requestAnimationFrame=()=>0;""")
        def route(r):
            if not r.request.url.startswith('http://127.0.0.1:8080/'):
                r.abort()
            elif '/js/main.js' in r.request.url:
                response = r.fetch()
                source = response.text().replace('window.advanceTime = function',
                    "window.trailProfileScreen = mode => {screen=mode==='5v5'?'play5':'play';paused=false;}; window.advanceTime = function")
                r.fulfill(response=response, body=source)
            else:
                r.continue_()
        page.route('**/*', route)
        page.goto('http://127.0.0.1:8080/index.html')
        page.wait_for_function('!!window.trailProfileScreen')
        page.evaluate('advanceTime(0)')
        for mode in ['1v1', '5v5']:
            values = {0: [], .14: []}
            expected = None
            for n in range(args.rounds):
                for alpha in ([0, .14] if n % 2 == 0 else [.14, 0]):
                    # Fresh page restores camera smoothing, replay buffers and UI caches too.
                    page.reload()
                    page.wait_for_function('!!window.trailProfileScreen')
                    page.evaluate('advanceTime(0)')
                    result = page.evaluate(RUN, {'mode': mode, 'alpha': alpha, 'frames': args.frames})
                    state = result.pop('state')
                    if expected is None:
                        expected = state
                    assert state == expected, f'{mode}: seeded simulation diverged'
                    values[alpha].append(result['ms'])
                    print(json.dumps(result), flush=True)
            off = sum(values[0]) / len(values[0])
            on = sum(values[.14]) / len(values[.14])
            print(f'RESULT {mode}: off={off:.3f} ms/frame; on={on:.3f} ms/frame; delta={on-off:+.3f} ms ({(on/off-1)*100:+.1f}%); {args.rounds} paired rounds x {args.frames} frames; identical simulation state', flush=True)
        browser.close()


if __name__ == '__main__':
    main()
