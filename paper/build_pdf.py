from pathlib import Path
import re, json
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak, KeepTogether)
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics

ROOT=Path(__file__).resolve().parents[1]
PAPER=ROOT/'paper'
OUT=ROOT/'paper'/'research-paper.pdf'
text=(PAPER/'research-paper.md').read_text(encoding='utf-8-sig')

# Register fonts available on Windows for consistent Unicode/math rendering.
font_dir=Path('C:/Windows/Fonts')
for name,fn in [('DejaVu','arial.ttf'),('DejaVu-Bold','arialbd.ttf'),('DejaVu-Italic','ariali.ttf')]:
    path=font_dir/fn
    if path.exists(): pdfmetrics.registerFont(TTFont(name,str(path)))
bodyfont='DejaVu' if 'DejaVu' in pdfmetrics.getRegisteredFontNames() else 'Helvetica'
boldfont='DejaVu-Bold' if 'DejaVu-Bold' in pdfmetrics.getRegisteredFontNames() else 'Helvetica-Bold'
italicfont='DejaVu-Italic' if 'DejaVu-Italic' in pdfmetrics.getRegisteredFontNames() else 'Helvetica-Oblique'

navy=colors.HexColor('#14213D'); blue=colors.HexColor('#2563EB'); teal=colors.HexColor('#0F9D8A'); gray=colors.HexColor('#526174')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='PaperTitle',parent=styles['Title'],fontName=boldfont,fontSize=21,leading=26,textColor=navy,alignment=TA_CENTER,spaceAfter=12))
styles.add(ParagraphStyle(name='Meta',fontName=bodyfont,fontSize=9.5,leading=13,textColor=gray,alignment=TA_CENTER,spaceAfter=3))
styles.add(ParagraphStyle(name='Abstract',fontName=bodyfont,fontSize=9.1,leading=13,alignment=TA_JUSTIFY,leftIndent=9*mm,rightIndent=9*mm,spaceAfter=4))
styles.add(ParagraphStyle(name='H1x',fontName=boldfont,fontSize=13,leading=17,textColor=navy,spaceBefore=12,spaceAfter=5,keepWithNext=True))
styles.add(ParagraphStyle(name='H2x',fontName=boldfont,fontSize=10.5,leading=14,textColor=blue,spaceBefore=8,spaceAfter=3,keepWithNext=True))
styles.add(ParagraphStyle(name='Bodyx',fontName=bodyfont,fontSize=9.2,leading=13,alignment=TA_JUSTIFY,spaceAfter=6,allowWidows=0,allowOrphans=0))
styles.add(ParagraphStyle(name='Bulletx',parent=styles['Bodyx'],leftIndent=12,firstLineIndent=-8,spaceAfter=4))
styles.add(ParagraphStyle(name='Caption',fontName=italicfont,fontSize=8,leading=10,textColor=gray,alignment=TA_LEFT,spaceBefore=3,spaceAfter=9))
styles.add(ParagraphStyle(name='TableCell',fontName=bodyfont,fontSize=7.2,leading=9,spaceAfter=0))
styles.add(ParagraphStyle(name='TableHead',fontName=boldfont,fontSize=7.3,leading=9,textColor=colors.white,spaceAfter=0))
styles.add(ParagraphStyle(name='Codex',fontName='Courier',fontSize=8.2,leading=11,textColor=teal,spaceAfter=2))

story=[]
def esc(s):
    s=s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    # convert inline Markdown emphasis/code and links to ReportLab markup
    s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'\*(.+?)\*',r'<i>\1</i>',s)
    s=re.sub(r'`(.+?)`',r'<font name="Courier" size="8">\1</font>',s)
    s=re.sub(r'<(https?://[^ >]+)>',r'<link href="\1" color="#2563EB">\1</link>',s)
    s=re.sub(r'\[(.*?)\]\((https?://.*?)\)',r'<link href="\2" color="#2563EB">\1</link>',s)
    return s

lines=text.splitlines(); i=0; figure_map={f'fig{k}':PAPER/'figures'/f'fig{k}_{label}.png' for k,label in [(1,'protocol'),(2,'visibility'),(3,'gas'),(4,'scaling_model'),(5,'order_independence')]}
while i<len(lines):
    line=lines[i].strip()
    if not line: i+=1; continue
    if line.startswith('# '):
        story.append(Spacer(1,16)); story.append(Paragraph(esc(line[2:]),styles['PaperTitle'])); i+=1; continue
    if line.startswith('**Author:**') or line.startswith('**Version:**') or line.startswith('**Date:**'):
        story.append(Paragraph(esc(line.replace('**','')),styles['Meta'])); i+=1; continue
    if line.startswith('## '):
        heading=line[3:]
        if heading=='Figures': story.append(PageBreak())
        story.append(Paragraph(esc(heading),styles['H1x'])); i+=1; continue
    if line.startswith('### '): story.append(Paragraph(esc(line[4:]),styles['H2x'])); i+=1; continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            raw=lines[i].strip().strip('|').split('|')
            if all(re.fullmatch(r'\s*:?-{3,}:?\s*',c) for c in raw): i+=1; continue
            head=len(rows)==0
            rows.append([Paragraph(esc(c.strip()),styles['TableHead' if head else 'TableCell']) for c in raw]); i+=1
        widths=[31*mm,36*mm,45*mm,49*mm]
        t=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),navy),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#CBD5E1')),('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F1F5F9')]),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
        story.extend([Spacer(1,4),t,Spacer(1,7)]); continue
    # Images included in markdown references
    if line.startswith('!['):
        m=re.match(r'!\[(.*?)\]\((.*?)\)',line)
        if m:
            alt,path=m.groups(); p=(PAPER/path).resolve()
            if p.exists():
                caption=''
                if story and isinstance(story[-1],Paragraph) and story[-1].getPlainText().startswith('Figure '):
                    caption=story.pop().getPlainText()
                im=Image(str(p)); maxw=165*mm; maxh=190*mm if p.name=='contact-sheet.png' else 130*mm; scale=min(maxw/im.imageWidth,maxh/im.imageHeight,1); im.drawWidth*=scale; im.drawHeight*=scale; im.hAlign='CENTER'
                story.append(KeepTogether([im,Paragraph(esc(caption or alt),styles['Caption'])]))
        i+=1; continue
    if line.startswith('**Figure '): story.append(Paragraph(esc(line.replace('**','')),styles['Caption'])); i+=1; continue
    if line.startswith('**') and line.endswith('**'):
        story.append(Paragraph(esc(line),styles['Bodyx'])); i+=1; continue
    if re.match(r'^\d+\.\s',line):
        story.append(Paragraph(esc(line),styles['Bulletx'])); i+=1; continue
    if line.startswith('- '): story.append(Paragraph('&#8226; '+esc(line[2:]),styles['Bulletx'])); i+=1; continue
    if line.startswith('```'):
        i+=1
        while i<len(lines) and not lines[i].startswith('```'):
            story.append(Paragraph(esc(lines[i]),styles['Codex'])); i+=1
        i+=1; continue
    para=[line]; i+=1
    while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|','![','```','- ')) and not re.match(r'^\d+\.\s',lines[i].strip()):
        para.append(lines[i].strip()); i+=1
    story.append(Paragraph(esc(' '.join(para)),styles['Abstract'] if para[0].startswith('This paper presents') else styles['Bodyx']))

def footer(canvas,doc):
    canvas.saveState(); w,h=A4
    canvas.setStrokeColor(colors.HexColor('#D8E0EA')); canvas.setLineWidth(.5); canvas.line(22*mm,16*mm,w-22*mm,16*mm)
    canvas.setFont(bodyfont,8); canvas.setFillColor(gray); canvas.drawString(22*mm,10.5*mm,'Classroom Cloud Auction | Research Paper')
    canvas.drawRightString(w-22*mm,10.5*mm,f'Page {doc.page}')
    canvas.restoreState()

doc=SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=22*mm,leftMargin=22*mm,topMargin=20*mm,bottomMargin=23*mm,title='A Commit-Reveal Auction for Classroom Cloud Resource Allocation',author='Student project team',subject='Research paper and local demonstration evaluation')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
