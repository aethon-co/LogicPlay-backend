const db = require('../config/db');

function toPublicAssetUrl(value) {
  if (!value) return '';
  const raw = String(value).trim().replace(/\?+$/, '');
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return encodeURI(raw);

  const normalizedPath = raw.replace(/^\/+/, '');
  const explicitBase = (process.env.STORAGE_PUBLIC_BASE_URL || '').trim();
  if (explicitBase) {
    return encodeURI(`${explicitBase.replace(/\/+$/, '')}/${normalizedPath}`);
  }

  const projectUrl = (process.env.SUPABASE_PROJECT_URL || '').trim();
  const bucket = (process.env.STORAGE_BUCKET || 'logicbox-jr-app-assets').trim();
  if (projectUrl && normalizedPath.startsWith('storage/v1/object/public/')) {
    return encodeURI(`${projectUrl.replace(/\/+$/, '')}/${normalizedPath}`);
  }
  if (projectUrl) {
    const pathWithoutBucket = normalizedPath.startsWith(`${bucket}/`)
      ? normalizedPath.slice(bucket.length + 1)
      : normalizedPath;
    return encodeURI(`${projectUrl.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${pathWithoutBucket}`);
  }

  return encodeURI(raw);
}

function normalizeGameRow(row) {
  const title = row.title || row.name || row.file_name || 'Untitled';
  const gameUrl = toPublicAssetUrl(row.game_url || row.file_url || '');
  const thumbnailUrl = toPublicAssetUrl(row.thumbnail_url || row.image_url || '');
  const gradeLevel = row.grade_level || row.grade || '';
  const category = row.subject || row.category || 'General';

  return {
    id: row.id,
    title,
    description: row.description || '',
    grade_level: String(gradeLevel),
    game_url: gameUrl,
    thumbnail_url: thumbnailUrl,
    category,
    created_at: row.created_at || null,
  };
}

exports.getGamesByGrade = async (req, res) => {
  const { grade } = req.query;

  if (!grade) {
    return res.status(400).json({ error: 'Grade parameter is required' });
  }

  try {
    const { rows } = await db.query('SELECT * FROM games ORDER BY created_at ASC NULLS LAST');
    const gradeValue = String(grade);
    const filteredRows = rows.filter((row) => {
      const rowGrade = String(row.grade_level ?? row.grade ?? '');
      return rowGrade === gradeValue;
    });

    const isAuthed = Boolean(req.user);
    const games = filteredRows.map((row, idx) => {
      const game = normalizeGameRow(row);
      const locked = !isAuthed && idx >= 2;
      return {
        ...game,
        locked,
        game_url: locked ? null : game.game_url,
      };
    });

    res.status(200).json({ games });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAvailableGrades = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT COALESCE(NULLIF(grade_level, ''), NULLIF(grade, '')) AS grade_value
       FROM games
       WHERE COALESCE(NULLIF(grade_level, ''), NULLIF(grade, '')) IS NOT NULL
       ORDER BY grade_value ASC`
    );

    const grades = rows
      .map((row) => String(row.grade_value || '').trim())
      .where((grade) => grade.isNotEmpty);

    res.status(200).json({ grades });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllGames = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM games ORDER BY created_at ASC NULLS LAST');
        res.status(200).json({ games: rows.map(normalizeGameRow) });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
};

exports.getMultiplayerLeaderboard = async (req, res) => {
  const { grade } = req.query;
  try {
    let result;
    if (grade) {
      result = await db.query(
        `SELECT id, full_name, grade, school_name, COALESCE(multiplayer_score, 0) AS multiplayer_score
         FROM users
         WHERE grade = $1
         ORDER BY multiplayer_score DESC
         LIMIT 50`,
        [grade]
      );
    } else {
      result = await db.query(
        `SELECT id, full_name, grade, school_name, COALESCE(multiplayer_score, 0) AS multiplayer_score
         FROM users
         ORDER BY multiplayer_score DESC
         LIMIT 50`
      );
    }
    res.status(200).json({ leaderboard: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
