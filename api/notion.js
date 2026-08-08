module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { dbId, action, properties, pageId, filter, content } = req.body || {};

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'Token not configured' });

  // CREATE PAGE — nuevas entradas (ej. Daily Mood)
  if (action === 'createPage') {
    if (!dbId || !properties) return res.status(400).json({ error: 'Missing dbId or properties' });
    try {
      const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parent: { database_id: dbId }, properties })
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Notion error', details: data });
      return res.status(200).json({ ok: true, page: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // UPDATE PAGE — actualizar propiedades de una página existente
  if (action === 'updatePage') {
    if (!pageId || !properties) return res.status(400).json({ error: 'Missing pageId or properties' });
    try {
      const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Notion error', details: data });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // APPEND CONTENT — insertar bloque al inicio del cuerpo de una página (notas de asistentes)
  if (action === 'appendContent') {
    if (!pageId || !content) return res.status(400).json({ error: 'Missing pageId or content' });
    try {
      // Notion API no soporta "insert at start" directo — usamos children con after omitido = al final.
      // Para mantener "más reciente arriba" habría que leer y reordenar; simplificamos: prepend real
      // requiere leer blocks existentes primero.
      const existingRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
        headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' }
      });
      const existing = await existingRes.json();
      const firstBlockId = existing.results && existing.results[0] ? existing.results[0].id : null;

      const newBlocks = [
        {
          object: 'block', type: 'heading_3',
          heading_3: { rich_text: [{ type: 'text', text: { content: content.heading || '' } }] }
        },
        {
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: content.body || '' } }] }
        }
      ];

      const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ children: newBlocks, ...(firstBlockId ? {} : {}) })
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Notion error', details: data });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DEFAULT: QUERY — leer una base de datos
  if (!dbId) return res.status(400).json({ error: 'Missing dbId' });

  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${dbId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ page_size: 100, ...(filter ? { filter } : {}) })
      }
    );
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
