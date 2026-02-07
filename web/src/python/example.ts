/**
 * Pyodide Worker Usage Examples
 *
 * This file demonstrates common usage patterns for the Pyodide Worker
 */

import {
  PyodideWorkerManager,
  createTextFile,
  fileOutputToText,
  downloadFileOutput,
} from './manager'

//=============================================================================
// Example 1: Basic Python Execution
//=============================================================================

export async function basicExample() {
  const manager = new PyodideWorkerManager()

  try {
    const result = await manager.execute(`
# Basic Python operations
x = 10
y = 20
print(f"The sum of {x} and {y} is {x + y}")

# Return the result
x + y
`)

    if (result.success) {
      console.log('Result:', result.result) // 30
      console.log('Stdout:', result.stdout) // "The sum of 10 and 20 is 30"
      console.log('Execution time:', result.executionTime)
    }
  } finally {
    manager.terminate()
  }
}

//=============================================================================
// Example 2: Using Pandas
//=============================================================================

export async function pandasExample() {
  const manager = new PyodideWorkerManager()

  try {
    const result = await manager.execute(
      `
import pandas as pd
import numpy as np

# Create a DataFrame
df = pd.DataFrame({
    'Name': ['Alice', 'Bob', 'Charlie'],
    'Age': [25, 30, 35],
    'Score': [85.5, 90.2, 88.9]
})

print(df)
print("\\nStatistics:")
print(df.describe())

# Convert to dict for JSON serialization
df.to_dict('records')
`,
      [], // No input files
      ['pandas', 'numpy'] // Load packages
    )

    if (result.success) {
      console.log('Data:', result.result)
      console.log('Output:', result.stdout)
    }
  } finally {
    manager.terminate()
  }
}

//=============================================================================
// Example 3: File I/O
//=============================================================================

export async function fileIoExample() {
  const manager = new PyodideWorkerManager()

  try {
    // Create input file
    const csvContent = `name,age,city
Alice,30,NYC
Bob,25,LA
Charlie,35,SF`

    const result = await manager.execute(
      `
import pandas as pd

# Read file from /mnt
df = pd.read_csv('/mnt/input.csv')
print("Input data:")
print(df)

# Process data
df['age_plus_10'] = df['age'] + 10

# Save output
df.to_csv('/mnt/output.csv', index=False)

print("\\nOutput data:")
print(df)

df.to_dict('records')
`,
      [createTextFile('input.csv', csvContent)], // Inject file
      ['pandas']
    )

    if (result.success) {
      console.log('Result:', result.result)

      // Read output file
      if (result.outputFiles && result.outputFiles.length > 0) {
        const outputFile = result.outputFiles[0]
        const content = fileOutputToText(outputFile)
        console.log('Output file:', content)

        // Or download it
        downloadFileOutput(outputFile)
      }
    }
  } finally {
    manager.terminate()
  }
}

//=============================================================================
// Example 4: Matplotlib Visualization
//=============================================================================

export async function matplotlibExample() {
  const manager = new PyodideWorkerManager()

  try {
    const result = await manager.execute(
      `
import matplotlib.pyplot as plt
import numpy as np
import io
import base64

# Create data
x = np.linspace(0, 2 * np.pi, 100)
y = np.sin(x)

# Create plot
plt.figure(figsize=(10, 6))
plt.plot(x, y, label='sin(x)', linewidth=2)
plt.xlabel('x')
plt.ylabel('sin(x)')
plt.title('Sine Wave')
plt.legend()
plt.grid(True)

# Save plot to /mnt
plt.savefig('/mnt/sine_wave.png', dpi=100, bbox_inches='tight')
plt.close()

# Return data points
{'x': x.tolist(), 'y': y.tolist()}
`,
      [],
      ['matplotlib', 'numpy']
    )

    if (result.success) {
      console.log('Data:', result.result)

      // Display images
      if (result.images && result.images.length > 0) {
        result.images.forEach((img) => {
          console.log(`Image: ${img.filename}`)
          const imgElement = document.createElement('img')
          imgElement.src = `data:image/png;base64,${img.data}`
          imgElement.style.maxWidth = '100%'
          document.body.appendChild(imgElement)
        })
      }
    }
  } finally {
    manager.terminate()
  }
}

//=============================================================================
// Example 5: Data Analysis with Multiple Outputs
//=============================================================================

export async function dataAnalysisExample() {
  const manager = new PyodideWorkerManager()

  try {
    const salesData = createTextFile(
      'sales.csv',
      `product,quarter,revenue
Product A,Q1,100000
Product A,Q2,120000
Product A,Q3,110000
Product A,Q4,130000
Product B,Q1,80000
Product B,Q2,90000
Product B,Q3,85000
Product B,Q4,95000`
    )

    const result = await manager.execute(
      `
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# Read data
df = pd.read_csv('/mnt/sales.csv')
print("Sales Data:")
print(df)

# Calculate statistics
stats = df.groupby('product')['revenue'].agg(['sum', 'mean', 'std'])
print("\\nStatistics by Product:")
print(stats)

# Create visualization
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# Bar chart
df.groupby('product')['revenue'].sum().plot(kind='bar', ax=axes[0])
axes[0].set_title('Total Revenue by Product')
axes[0].set_ylabel('Revenue')

# Line chart
for product in df['product'].unique():
    data = df[df['product'] == product]
    axes[1].plot(data['quarter'], data['revenue'], label=product, marker='o')
axes[1].set_title('Quarterly Revenue Trends')
axes[1].set_xlabel('Quarter')
axes[1].set_ylabel('Revenue')
axes[1].legend()
axes[1].grid(True)

plt.tight_layout()
plt.savefig('/mnt/analysis.png', dpi=120, bbox_inches='tight')
plt.close()

# Save processed data
stats.to_csv('/mnt/statistics.csv')

stats.to_dict('index')
`,
      [salesData],
      ['pandas', 'matplotlib', 'numpy']
    )

    if (result.success) {
      console.log('Statistics:', result.result)
      console.log('Stdout:', result.stdout)

      // Download all output files
      if (result.outputFiles) {
        result.outputFiles.forEach((file) => {
          console.log(`Output file: ${file.name}`)
          downloadFileOutput(file)
        })
      }

      // Display chart
      if (result.images && result.images.length > 0) {
        const img = result.images[0]
        const imgElement = document.createElement('img')
        imgElement.src = `data:image/png;base64,${img.data}`
        imgElement.style.maxWidth = '100%'
        imgElement.style.border = '1px solid #ccc'
        imgElement.style.borderRadius = '8px'
        imgElement.style.padding = '10px'
        document.body.appendChild(imgElement)
      }
    }
  } finally {
    manager.terminate()
  }
}

//=============================================================================
// Example 6: Error Handling
//=============================================================================

export async function errorHandlingExample() {
  const manager = new PyodideWorkerManager()

  try {
    const result = await manager.execute(`
# This will raise an error
x = 1 / 0
`)

    if (!result.success) {
      console.error('Python error:', result.error)
      // Error will contain full traceback
    }
  } finally {
    manager.terminate()
  }
}

//=============================================================================
// Example 7: Preloading Packages
//=============================================================================

export async function preloadExample() {
  const manager = new PyodideWorkerManager()

  try {
    // Preload common packages during initialization
    console.log('Preloading packages...')
    await manager.execute('', [], ['pandas', 'numpy', 'matplotlib', 'scipy'])

    // Now subsequent executions will be faster
    const result1 = await manager.execute('import pandas as pd; pd.__version__')
    console.log('Pandas version:', result1.result)

    const result2 = await manager.execute('import numpy as np; np.__version__')
    console.log('NumPy version:', result2.result)
  } finally {
    manager.terminate()
  }
}

//=============================================================================
// Example 8: Timeout Handling
//=============================================================================

export async function timeoutExample() {
  const manager = new PyodideWorkerManager()

  try {
    // This will timeout after 2 seconds
    const result = await manager.execute(
      `
import time
time.sleep(5)  # Sleep for 5 seconds
print("This will not print")
`,
      [],
      [],
      2000 // 2 second timeout
    )

    if (!result.success) {
      console.error('Execution timed out:', result.error)
    }
  } catch (error) {
    console.error('Worker error:', error)
  } finally {
    manager.terminate()
  }
}

//=============================================================================
// Example 9: Reusing Worker Instance
//=============================================================================

export async function reuseExample() {
  const manager = new PyodideWorkerManager()

  try {
    // Execute multiple times with the same worker instance
    const results = await Promise.all([
      manager.execute('print("Task 1"); 1'),
      manager.execute('print("Task 2"); 2'),
      manager.execute('print("Task 3"); 3'),
    ])

    results.forEach((result, i) => {
      if (result.success) {
        console.log(`Task ${i + 1} result:`, result.result)
        console.log(`Task ${i + 1} stdout:`, result.stdout)
      }
    })
  } finally {
    manager.terminate()
  }
}
