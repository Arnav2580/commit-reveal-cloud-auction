from PIL import Image,ImageDraw
from pathlib import Path
ps=sorted(Path('paper/photos/pdf-preview').glob('page-*.png'))
out=Image.new('RGB',(1020,780),'#e5e7eb'); d=ImageDraw.Draw(out)
for i,p in enumerate(ps):
 im=Image.open(p).convert('RGB'); im.thumbnail((245,350)); x=(i%4)*255; y=(i//4)*390
 out.paste(im,(x,y)); d.text((x+8,y+360),p.stem,fill='#111827')
out.save('paper/photos/contact-sheet.png')
