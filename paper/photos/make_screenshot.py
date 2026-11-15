from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import textwrap
src=Path(__file__).with_name('demo-output.txt').read_text(encoding='utf-8-sig')
W,H=2200,1600
im=Image.new('RGB',(W,H),'#101827'); d=ImageDraw.Draw(im)
font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',28); small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',25)
d.rectangle((0,0,W,76),fill='#1d2b42')
for x,c in [(35,'#f06a61'),(66,'#f4bd4f'),(97,'#62c554')]: d.ellipse((x,28,x+17,45),fill=c)
d.text((140,20),'Hardhat local demo | commit-reveal auction',font=small,fill='#d9e3f0')
y=108
for line in src.splitlines():
    color='#b9c7d8'
    if line.startswith('---'): color='#6ee7c1' if 'Ordering' in line else '#f6c177'
    if 'attacker' in line.lower() or 'observe' in line.lower(): color='#ff8f8f'
    if 'Before finalization' in line or "highestBid: '0'" in line: color='#f7d794'
    if 'winningBid' in line or 'allocated: true' in line: color='#70e1a4'
    wrapped=textwrap.wrap(line,width=116,subsequent_indent='    ') or ['']
    for part in wrapped:
        if y>H-36: raise ValueError('Screenshot canvas is too short; increase H to avoid clipping.')
        d.text((40,y),part,font=font,fill=color); y+=37
im.crop((0,0,W,min(H,y+26))).save(Path(__file__).with_name('demo-terminal.png'))
