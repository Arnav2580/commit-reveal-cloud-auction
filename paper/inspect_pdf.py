import fitz
from pathlib import Path
p=fitz.open('paper/research-paper.pdf')
for i,page in enumerate(p):
 imgs=page.get_images(full=True)
 if imgs:
  print('page',i+1,'images',[(x[2],x[3]) for x in imgs])
  for b in page.get_text('dict')['blocks']:
   if b.get('type')==1: print('  box',tuple(round(v,1) for v in b['bbox']),'pixels',b['width'],b['height'])
 print('page',i+1,'text',len(page.get_text()))
