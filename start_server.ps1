$port = 8000
$projectPath = "C:\Users\gabrielmota\Desktop\Pokertrainer"

Write-Host "Starting HTTP server on port $port..."
Write-Host "Open browser at http://localhost:$port"
Write-Host "Range Visualizer: http://localhost:$port/treino_range_visualizer.html"
Write-Host ""
Write-Host "Press Ctrl+C to stop the server"
Write-Host ""

cd $projectPath
python -m http.server $port
