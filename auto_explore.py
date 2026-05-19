import subprocess
import time
import sys
import os

def run_exploration():
    # Sequence of inputs
    inputs = [
        "s", # Load historical cache?
        # --- MENU 1: DATOS ---
        "1", "4", "", # Stats + Pause
        "3", "",      # Unify + Pause
        "0",          # Back
        # --- MENU 3: KNN (Historical) ---
        "3", 
        "1", "1", "5", "", # KNN Hist (Station 1) + Pause
        "1", "6", "5", "", # KNN Hist (Station 6) + Pause
        "1", "12", "5", "", # KNN Hist (Station 12) + Pause
        "3", "1", "5", "",  # All metrics (Station 1) + Pause
        "4", "",           # KNN Cruzado + Pause
        "6", "",           # Historial + Pause
        "0",               # Back
        # --- MENU 4: CLIMA ---
        "4",
        "1", "",           # Wind Corr + Pause
        "2", "1", "",      # Seasonal (Station 1) + Pause
        "2", "6", "",      # Seasonal (Station 6) + Pause
        "3", "150", "1", "3", "", # Critical Events + Analyze Event 1 + KNN Events + Pause
        "4", "1", "",      # Seasonal Comparison (Station 1) + Pause
        "0",               # Back
        # --- MENU 5: ALERTAS ---
        "5",
        "1", "20", "",     # Generate Alerts + Pause
        "2", "25", "1015", "10", "1.5", "", # Prediction (T=25, P=1015, D=10, W=1.5) + Pause
        "3", "",           # Ranking Criticidad + Pause
        "0",               # Back
        # --- MENU 7: BENCHMARK ---
        "7",
        "1", "1", "5", "", # Speed Benchmark (Station 1) + Pause
        "2", "",           # Complexity + Pause
        "3", "",           # Hardware + Pause
        "0",               # Back
        "0"                # Exit
    ]

    input_str = "\n".join(inputs) + "\n"
    
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    process = subprocess.Popen(
        [sys.executable, "interface.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding='utf-8',
        errors='replace',
        env=env,
        bufsize=1
    )

    stdout_data, _ = process.communicate(input=input_str)
    
    if stdout_data:
        with open("exploration_output.txt", "w", encoding='utf-8', errors='replace') as f:
            f.write(stdout_data)
    else:
        print("No output captured")

if __name__ == "__main__":
    run_exploration()
