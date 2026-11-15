from PIL import Image,ImageDraw
from pathlib import Path
root=Path(__file__).resolve().parents[1]; images=[root/'fig1_protocol.png',root/'fig2_visibility.png',root/'fig3_gas.png',root/'fig4_scaling_model.png',root/'fig5_order_independence.png',root/'fig6_market_comparison.png',root/'photos'/'demo-terminal.png']
labels=['Protocol flow','Bid visibility','Measured gas','Finalize scaling model','Reveal-order result','Market comparison','Actual local demo output']
out=Image.new('RGB',(1440,1720),'#e8edf3')
for i,(p,label) in enumerate(zip(images,labels)):
 im=Image.open(p).convert('RGB'); im.thumbnail((700,390)); tile=Image.new('RGB',(720,430),'white'); tile.paste(im,((720-im.width)//2,8)); ImageDraw.Draw(tile).text((18,405),label,fill='#14213D'); out.paste(tile,((i%2)*720,(i//2)*430))
tile=Image.new('RGB',(720,430),'white'); d=ImageDraw.Draw(tile)
d.text((36,55),'Figure guide',fill='#14213D')
d.text((36,112),'Analytical plots: protocol, visibility, gas,',fill='#526174')
d.text((36,150),'scaling model, reveal-order property, and',fill='#526174')
d.text((36,188),'market feature comparison.',fill='#526174')
d.text((36,254),'The terminal capture is a real local demo run.',fill='#526174')
d.text((36,292),'It does not represent a live web or testnet app.',fill='#526174')
out.paste(tile,(720,1290))
out.save(root/'photos'/'contact-sheet.png')
