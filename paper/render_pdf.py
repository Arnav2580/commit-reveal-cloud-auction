import fitz
from pathlib import Path
p=fitz.open('paper/research-paper.pdf')
out=Path('paper/photos/current-preview'); out.mkdir(exist_ok=True)
for i,page in enumerate(p): page.get_pixmap(matrix=fitz.Matrix(1.0,1.0),alpha=False).save(out/f'p{i+1}.png')
