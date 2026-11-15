from PIL import Image,ImageDraw
from pathlib import Path
ps=sorted(Path('paper/photos/current-preview').glob('p*.png'),key=lambda p:int(p.stem[1:]))
out=Image.new('RGB',(1000,970),'#d7dde5'); d=ImageDraw.Draw(out)
for i,p in enumerate(ps):
 im=Image.open(p).convert('RGB'); im.thumbnail((190,410)); x=(i%5)*200; y=(i//5)*485
 out.paste(im,(x,y)); d.text((x+8,y+420),p.stem,fill='#111827')
out.save('paper/photos/contact-sheet-final.png')
