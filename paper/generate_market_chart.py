from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
out=Path('paper/figures/fig6_market_comparison.png')
products=['This project','Open-bid\nbaseline','OpenSea\nSeaport','a16z Auction\nZoo','Centralized\nclassroom']
features=['Commit–reveal\nbid hiding','On-chain\nsettlement','Classroom\nresource record','Wallet/participant\nidentity','Production\nmarketplace scope','Local demo /\nsource visible','On-chain bid\nceiling']
# Documentation/code-scope presence matrix only: 1 documented/present, 0 not a stated focus.
data=np.array([
 [1,0,1,0,0,1,1],
 [0,0,1,0,0,1,0],
 [0,1,0,0,1,1,0],
 [1,1,0,0,0,1,0],
 [0,0,1,1,0,0,0],
])
fig,ax=plt.subplots(figsize=(10.7,5.2))
ax.set_xlim(-.5,len(features)-.5); ax.set_ylim(len(products)-.5,-.5)
ax.set_xticks(range(len(features)),features); ax.set_yticks(range(len(products)),products)
ax.tick_params(axis='x',labelsize=8,pad=9); ax.tick_params(axis='y',labelsize=9,length=0)
for x in range(len(features)):
 for y in range(len(products)):
  present=data[y,x]==1
  color='#0F9D8A' if present else '#E6EBF2'
  ax.scatter(x,y,s=500,marker='s',c=color,edgecolors='white',linewidths=1.5,zorder=2)
  ax.text(x,y,'✓' if present else '—',ha='center',va='center',fontsize=12,weight='bold',color='white' if present else '#8A96A8',zorder=3)
ax.set_xticks(np.arange(-.5,len(features),1),minor=True); ax.set_yticks(np.arange(-.5,len(products),1),minor=True)
ax.grid(which='minor',color='white',linewidth=2); ax.tick_params(which='minor',bottom=False,left=False)
for s in ax.spines.values(): s.set_visible(False)
fig.suptitle('Documented feature coverage across auction products',x=.5,y=.99,fontsize=14,weight='bold',color='#14213D')
ax.set_title('Qualitative scope comparison only - no usability, security, or throughput scores',fontsize=9,color='#526174',pad=26)
fig.text(.5,.015,'Green = documented capability in repository/source scope. Gray = not a stated focus in reviewed sources; not proof of absence.',ha='center',fontsize=8,color='#526174')
fig.tight_layout(rect=[0,.055,1,.91]); fig.savefig(out,dpi=240,bbox_inches='tight',facecolor='white'); plt.close(fig)
print(out)
