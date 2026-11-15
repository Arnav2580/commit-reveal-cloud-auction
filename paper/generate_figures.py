import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.titleweight': 'bold', 'figure.dpi': 180, 'savefig.dpi': 240})
NAVY='#14213D'; BLUE='#2563EB'; TEAL='#0F9D8A'; GOLD='#F4A261'; RED='#D1495B'; PALE='#F1F5F9'; GRAY='#526174'

def save(fig, name):
    fig.savefig(OUT / name, bbox_inches='tight', facecolor='white'); plt.close(fig)

# 1: protocol architecture
fig, ax = plt.subplots(figsize=(10, 3.1)); ax.set_xlim(0,10); ax.set_ylim(0,3); ax.axis('off')
boxes=[(0.2,1.05,2.0,1.0,'1  COMMIT','hash(bid, nonce)\nwallet transaction',BLUE),(2.7,1.05,2.0,1.0,'2  REVEAL','bid + nonce\nchecked on-chain',TEAL),(5.2,1.05,2.0,1.0,'3  FINALIZE','after deadline\nselect max valid bid',GOLD),(7.7,1.05,2.0,1.0,'4  ALLOCATE','record winner\nresource ID',NAVY)]
for x,y,w,h,title,body,color in boxes:
    p=FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0.04,rounding_size=0.12',facecolor=color,edgecolor='none'); ax.add_patch(p)
    ax.text(x+w/2,y+.69,title,ha='center',va='center',color='white',weight='bold',fontsize=11); ax.text(x+w/2,y+.32,body,ha='center',va='center',color='white',fontsize=9)
for x in [2.25,4.75,7.25]: ax.add_patch(FancyArrowPatch((x,1.55),(x+.4,1.55),arrowstyle='-|>',mutation_scale=16,lw=1.6,color=GRAY))
ax.text(5,2.6,'Classroom commit–reveal auction: protocol and trust boundaries',ha='center',weight='bold',fontsize=14,color=NAVY)
ax.text(5,.35,'The bid stays hidden until the reveal phase; winner selection waits until all reveals close.',ha='center',fontsize=9,color=GRAY)
save(fig,'fig1_protocol.png')

# 2: timing/privacy state
fig, ax = plt.subplots(figsize=(8.6,3.7)); ax.set_xlim(0,120); ax.set_ylim(-.1,1.2); ax.set_yticks([0,1],['Bid amount\npublic on-chain','Bid amount\nhidden on-chain']); ax.set_xticks([0,60,120],['Start','Commit closes','Reveal closes']); ax.grid(axis='x',alpha=.2)
ax.axvspan(0,60,color=BLUE,alpha=.12); ax.axvspan(60,120,color=TEAL,alpha=.12)
ax.plot([0,60],[1,1],lw=12,color=BLUE,solid_capstyle='butt'); ax.plot([60,120],[0,0],lw=12,color=GOLD,solid_capstyle='butt')
ax.text(30,1.12,'Commit: hash only',ha='center',color=BLUE,weight='bold'); ax.text(90,.13,'Reveal: bids become public',ha='center',color='#9A5B00',weight='bold')
ax.set_title('On-chain bid visibility across a 60s + 60s protocol cycle',color=NAVY); ax.set_xlabel('Illustrative phase duration (seconds); contract durations are configurable')
for s in ['top','right','left']: ax.spines[s].set_visible(False)
save(fig,'fig2_visibility.png')

# 3: measured gas by phase
p=ROOT/'paper'/'measurements.json'
if p.exists():
    d=json.loads(p.read_text()); vals=d['gasUsed']; labels=['Deploy','Commit','Reveal','Finalize']; nums=[int(vals[k]) for k in ['deploy','commit','reveal','finalize']]
    fig, ax=plt.subplots(figsize=(8,4)); bars=ax.bar(labels,nums,color=[NAVY,BLUE,TEAL,GOLD],width=.62)
    ax.bar_label(bars,labels=[f'{v:,}' for v in nums],padding=3,fontsize=9); ax.set_ylabel('Gas used (local Hardhat EVM)'); ax.set_title(f'Execution cost by transaction type ({d["bidders"]} bidder run)',color=NAVY); ax.grid(axis='y',alpha=.2); ax.set_axisbelow(True)
    ax.text(.01,-.2,'Measured locally; excludes network fee and confirmation latency. Commit/reveal are per bidder; finalize scans committed addresses.',transform=ax.transAxes,color=GRAY,fontsize=8)
    save(fig,'fig3_gas.png')

# 4: gas/finalization scaling theoretical from code
xs=[1,10,25,50,100,250,500]; base=int(json.loads(p.read_text())['gasUsed']['finalize']) if p.exists() else 72000; n0=int(json.loads(p.read_text())['bidders']) if p.exists() else 10
# baseline is local measurement at n0, illustrate linear scan extrapolation from observed marginal (explicit model)
fixed=max(25000,base-int(2500*n0)); ys=[fixed+2500*x for x in xs]
fig,ax=plt.subplots(figsize=(8,4)); ax.plot(xs,ys,marker='o',lw=2.5,color=BLUE); ax.fill_between(xs,ys,alpha=.1,color=BLUE); ax.set_xlabel('Committed bidders'); ax.set_ylabel('Illustrative finalize gas (gas units)'); ax.set_title('Finalization work grows with the number of committed wallets',color=NAVY); ax.grid(alpha=.2)
ax.text(.01,-.22,'Model illustration only: finalizeAuction iterates over every committed address. Values are not a network capacity test.',transform=ax.transAxes,color=GRAY,fontsize=8)
save(fig,'fig4_scaling_model.png')

# 5: reveal-order robustness logic comparison
fig,ax=plt.subplots(figsize=(8.5,3.7)); ax.axis('off'); ax.set_xlim(0,10); ax.set_ylim(0,4)
ax.text(5,3.65,'Outcome sensitivity to reveal order',ha='center',fontsize=14,weight='bold',color=NAVY)
seqs=[('Order A: 5 → 8 → 6','Winner: 8'),('Order B: 6 → 5 → 8','Winner: 8'),('Order C: 8 → 6 → 5','Winner: 8')]
for i,(s,w) in enumerate(seqs):
    y=2.8-i*.85; ax.text(.45,y,s,va='center',fontsize=11,color=GRAY); ax.plot([3.5,7.15],[y,y],color='#CBD5E1',lw=2); ax.text(7.7,y,w,va='center',weight='bold',color=TEAL,fontsize=11)
    ax.scatter([4.0,5.25,6.5],[y]*3,s=90,color=[BLUE,TEAL,GOLD],zorder=3)
ax.text(5,.1,'Code property: revealBid stores a verified bid but never updates highestBid or winner; finalization selects the maximum after the deadline.',ha='center',wrap=True,color=GRAY,fontsize=9)
save(fig,'fig5_order_independence.png')
