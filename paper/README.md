# Classroom Cloud Auction Research Artifacts

- `research-paper.md`: detailed paper with abstract, market analysis, methods, results, limitations, references, and figure captions.
- `research-paper.pdf`: formatted paper with all six analytical figures, actual demo screenshot, and image overview plate.
- `measurements.json`: sample gas measurements from the local Hardhat EVM.
- `generate_figures.py`: regenerate the five PNG figures; requires Python, matplotlib, and a non-GUI backend (`MPLBACKEND=Agg`).
- `generate_market_chart.py`: regenerate the qualitative feature coverage graph. Presence markers represent documented scope, not product quality scores.
- `figures/`: paper-ready figures.

Regenerate from the project root:

```powershell
npm run benchmark
$env:MPLBACKEND = "Agg"
python paper/generate_figures.py
python paper/generate_market_chart.py
python paper/photos/make_screenshot.py
python paper/photos/make_contact_sheet.py
python paper/build_pdf.py
```

Measurements are local EVM execution gas, not Sepolia timing, fees, throughput, or load-test results. Figure 4 is an illustrative linear-scan model.
