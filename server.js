const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'data', 'entries.json');

app.use(express.json());
app.use(express.static(__dirname));

async function ensureDataFile() {
  try {
    await fs.access(DATA_PATH);
  } catch (error) {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify([]), 'utf-8');
  }
}

async function readEntries() {
  await ensureDataFile();
  const content = await fs.readFile(DATA_PATH, 'utf-8');
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEntries(entries) {
  await fs.writeFile(DATA_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}

function sanitizeAmount(raw) {
  if (raw === null || raw === undefined) {
    return NaN;
  }
  let text = String(raw).toLowerCase();
  text = text.replace(/\beuros?\b/g, '');
  text = text.replace(/\beur\b/g, '');
  text = text.replace(/€|\s/g, '');
  text = text.replace(/,/g, '.');
  text = text.replace(/[a-z]/gi, '');
  const parsed = parseFloat(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

app.get('/api/entries', async (req, res) => {
  try {
    const entries = await readEntries();
    const total = entries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    res.json({ entries, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read entries.' });
  }
});

app.post('/api/entries', async (req, res) => {
  try {
    const { amount, rawValue, label } = req.body || {};

    const normalizedAmount = typeof amount === 'number' && Number.isFinite(amount)
      ? amount
      : sanitizeAmount(rawValue ?? amount);

    if (!Number.isFinite(normalizedAmount)) {
      return res.status(400).json({ error: 'Invalid amount value.' });
    }

    const entry = {
      id: req.body?.id || `entry_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      amount: normalizedAmount,
      rawValue: (rawValue ?? amount ?? '').toString().trim(),
      label: (label ?? '').toString().trim(),
      createdAt: Date.now()
    };

    const entries = await readEntries();
    entries.unshift(entry);
    await writeEntries(entries);

    const total = entries.reduce((sum, item) => sum + (item.amount || 0), 0);

    res.status(201).json({ entry, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save entry.' });
  }
});

app.delete('/api/entries/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const entries = await readEntries();
    const nextEntries = entries.filter(entry => entry.id !== id);

    if (nextEntries.length === entries.length) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    await writeEntries(nextEntries);
    const total = nextEntries.reduce((sum, item) => sum + (item.amount || 0), 0);

    res.json({ total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove entry.' });
  }
});

app.post('/api/entries/reset', async (req, res) => {
  try {
    await writeEntries([]);
    res.json({ message: 'All entries cleared.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear entries.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Expense tracker server running on http://localhost:${PORT}`);
});


