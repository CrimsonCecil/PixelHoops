#!/usr/bin/env python3
"""Side-by-side sheets of every tiered entrance / celebration move; requires Playwright and Pillow."""
import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

SETUP = """({key, ty}) => {
  const M=PH.game, G=M.G, R=PH.render;
  window.advanceTime(0); PH.CS.select('official'); M.seed(7);
  M.newGame({mode:'cpu',arch0:key,arch1:'herb'});
  Object.assign(G,{intro:null,tips:null,chk:null,phase:'dead',phaseT:99,state:'play'});
  const p=G.players[0], o=G.players[1];
  Object.assign(p,{x:0,y:5,vx:0,vy:0,face:-Math.PI/2,hasBall:false,chkHands:null});
  Object.assign(o,{x:7,y:12,vx:0,vy:0,hasBall:false});
  Object.assign(G.ball,{state:'loose',holder:-1,x:9,y:14,z:0,vx:0,vy:0,vz:0});
  G.cel={id:0,ty,lv:2,hurt:'none',t0:G.time,T:99,cz:true,big:true};
  if(!window.qaCanvas){window.qaCanvas=document.createElement('canvas'); R.resize(1920,1080); R.init(qaCanvas);}
  window.qaFrame=()=>{G.focus.cx=p.x; G.focus.cy=p.y-R.CAMV.dist; R.render(G,1/60);};
  window.qaStep=(n)=>{for(let i=0;i<n;i++){p.x=0;p.y=5;p.face=-Math.PI/2;M.tick(1/60,q=>M.t5.zeroInp());} qaFrame();};
  window.qaShot=()=>{const pt=R.proj(p.x,p.y,0),hd=R.proj(p.x,p.y,2.3);return {png:qaCanvas.toDataURL(),cx:pt.x,cy:pt.y,h:pt.y-hd.y,anim:p.anim,ty:G.cel&&G.cel.ty};};
}"""

CN = {'wave': '挥手致意', 'clap': '拍手', 'fist': '握拳', 'raise': '双臂高举', 'flex': '秀肌肉', 'chest': '捶胸', 'hype': '振臂煽动',
      'roar': '仰天怒吼', 'salute': '敬礼致意', 'spread': '展翅', 'point': '隔空点名', 'shimmy': '抖肩', 'robot': '机械舞', 'armwave': '电流波浪',
      'griddy': '格里迪舞', 'chalk': '撒镁粉', 'night': '晚安', 'watch': '看表', 'crown': '戴王冠', 'wag': '摇手指', 'step': '脚步点名'}
SHEETS = {
    'celebrations': [('普通档 · 普通进球', 'joe', ['point', 'clap', 'fist']),
                     ('中等档 · 三分 / 扣篮 / 盖帽等', 'joe', ['flex', 'chest', 'shimmy']),
                     ('高级档 · 隔扣 / 关键球 / 必杀技', 'joe', ['robot', 'armwave', 'griddy']),
                     ('球星招牌 · 2+1、3+1、绝杀必出', None, [('curry', 'night'), ('lillard', 'watch'), ('lebron', 'crown')])],
    'entrances': [('普通档 · 普通球员', 'joe', ['wave', 'clap', 'fist']),
                  ('中等档 · 中坚球员', 'joe', ['raise', 'flex', 'chest']),
                  ('高级档 · 球星', 'joe', ['hype', 'salute', 'spread']),
                  ('球星招牌 · 专属进场', None, [('lebron', 'chalk'), ('curry', 'night'), ('lillard', 'watch')])],
}
TIMES = [0.25, 0.55, 0.85, 1.15, 1.45]
CW, CH = 150, 190


def main():
    out = Path.home() / 'qa_out'
    out.mkdir(exist_ok=True)
    font = ImageFont.truetype(str(Path.home() / '.local/share/fonts/NotoSansSC.ttf'), 22)
    small = ImageFont.truetype(str(Path.home() / '.local/share/fonts/NotoSansSC.ttf'), 15)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/home/ubuntu/.local/bin/google-chrome', headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('http://127.0.0.1:8080/') else r.abort())
        page.goto('http://127.0.0.1:8080/index.html')
        page.wait_for_function('!!(window.PH && PH.CS && window.advanceTime)')
        for name, rows in SHEETS.items():
            mw = CW * len(TIMES) + 16
            sheet = Image.new('RGB', (mw * 3 + 16, 70 + len(rows) * (CH + 74)), '#111827')
            d = ImageDraw.Draw(sheet)
            d.text((16, 14), ('庆祝动作' if name == 'celebrations' else '进场动作') + ' · 四档 × 三套（每套 5 帧，间隔 0.3 秒）', font=font, fill='#ffd24a')
            for r, (title, key0, moves) in enumerate(rows):
                y0 = 64 + r * (CH + 74)
                d.text((16, y0), title, font=font, fill='white')
                for c, mv in enumerate(moves):
                    key, ty = mv if isinstance(mv, tuple) else (key0, mv)
                    page.evaluate(SETUP, {'key': key, 'ty': ty})
                    x0 = 16 + c * mw
                    d.text((x0, y0 + 32), f'{CN[ty]}（{ty}）' + (f' · {key}' if key != 'joe' else ''), font=small, fill='#cbd5e1')
                    t = 0
                    for i, tt in enumerate(TIMES):
                        page.evaluate(f'qaStep({round((tt - t) * 60)})')
                        t = tt
                        s = page.evaluate('qaShot()')
                        assert s['anim'] == 'cel' and s['ty'] == ty, s
                        img = Image.open(io.BytesIO(base64.b64decode(s['png'].split(',')[1])))
                        x, y = round(s['cx']), round(s['cy'])
                        hh = max(s['h'], 80)
                        crop = img.crop((round(x - hh * 0.62), round(y - hh * 1.25), round(x + hh * 0.62), round(y + hh * 0.33))).resize((CW - 6, CH), Image.Resampling.NEAREST)
                        sheet.paste(crop, (x0 + i * CW, y0 + 56))
            f = out / f'{name}.png'
            sheet.save(f)
            print('PASS', f)
        browser.close()


if __name__ == '__main__':
    main()
