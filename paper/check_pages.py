import fitz
p=fitz.open('paper/research-paper.pdf')
for i in range(6,9):
 print('\nPAGE',i+1,'\n',p[i].get_text()[:2500])
