#!/usr/bin/env python3
"""Local sprint trail before/after sheets; requires Playwright and Pillow."""
import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

SETUP = """({key, ball, enabled}) => {
  const M=PH.game, G=M.G, R=PH.render;
  window.advanceTime(0); PH.CS.select('official'); M.seed(7);
  Object.assign(G.train,{dummy:'none',role:'off',infStam:true});
  M.newGame({mode:'train',arch0:key,arch1:'herb'});
  Object.assign(G,{intro:null,tips:null,chk:null,phase:'live',state:'play'});
  M.applyTrain(); M.giveBall();
  const p=G.players[0]; Object.assign(p,{x:-6.8,y:5,face:0,chkHands:null});
  if(!ball){p.hasBall=false; Object.assign(G.ball,{state:'loose',holder:-1,x:6,y:13,z:0});}
  if(!enabled) PH.TUNE.set('l1_fxTrailAlpha',0);
  window.qaCanvas=document.createElement('canvas'); R.resize(640,360); R.init(qaCanvas);
  window.qaFrame=()=>{G.focus.cx=p.x; G.focus.cy=p.y-R.CAMV.dist; R.render(G,1/60);};
  window.qaStep=()=>{M.tick(1/60,q=>({...M.t5.zeroInp(),mx:q.id===0?1:0,sprint:q.id===0}));qaFrame();};
  for(let i=0;i<48;i++) qaStep();
  window.qaShot=()=>{const pt=R.proj(p.x,p.y,0.9);return {png:qaCanvas.toDataURL(),cx:pt.x,cy:pt.y,hasBall:p.hasBall,sprint:PH.gait.spW(p),anim:p.anim};};
}"""


def main():
    out = Path.home() / 'qa_out'
    out.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/home/ubuntu/.local/bin/google-chrome',
                                    headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('http://127.0.0.1:8080/') else r.abort())
        page.goto('http://127.0.0.1:8080/index.html')
        page.wait_for_function('!!(window.PH && PH.CS && window.advanceTime)')
        for label, key in [('short', 'dmitchell'), ('big', 'embiid')]:
            for ball in [True, False]:
                sheet = Image.new('RGB', (2160, 720), '#111827')
                draw = ImageDraw.Draw(sheet)
                for row, enabled in enumerate([False, True]):
                    page.evaluate(SETUP, {'key': key, 'ball': ball, 'enabled': enabled})
                    draw.text((12, row * 360 + 8), f"{key} | {'with ball' if ball else 'without ball'} | {'AFTER: default trail' if enabled else 'BEFORE: trail off'} | 100ms samples", fill='white')
                    for i in range(6):
                        if i:
                            page.evaluate('() => {for(let i=0;i<6;i++) qaStep();}')
                        data = page.evaluate('qaShot()')
                        assert data['hasBall'] == ball and data['sprint'] > .95 and data['anim'] == 'run', data
                        snap = Image.open(io.BytesIO(base64.b64decode(data['png'].split(',')[1])))
                        x, y = round(data['cx']), round(data['cy'])
                        crop = snap.crop((x-100, y-80, x+80, y+80)).resize((360, 320), Image.Resampling.NEAREST)
                        sheet.paste(crop, (i*360, row*360+30))
                filename = out / f"trail_{label}_{'ball' if ball else 'noball'}.png"
                sheet.save(filename)
                print(f'PASS {filename}: matched before/after sprint, six 100ms samples each', flush=True)
        browser.close()


if __name__ == '__main__':
    main()
