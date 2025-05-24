const path = require('path');
const fs = require('fs/promises');
const config = require(global.BASE_DIR + '/utils/config');
const { isAdmin } = require(global.BASE_DIR + '/utils/roles');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const sql = require('mssql');


exports.clearCostumeRender = async (req, res) => {
    const { serverKey, containerId, slot = 0 } = req.body;

    if (!serverKey || !containerId) {
        return res.status(400).send('Missing required parameters.');
    }

    const filename = `${serverKey}_${containerId}${slot == 0 ? '' : `_${slot}`}`;
    const imagePath = path.join(global.BASE_DIR, 'public', 'images', 'portrait', `${filename}.png`);

    try {
        await fs.unlink(imagePath);
        console.log(`[INFO] Deleted portrait: ${imagePath}`);
    } catch (err) {
        if (err.code !== 'ENOENT') {
        console.warn(`[WARN] Failed to delete portrait: ${err.message}`);
        return res.status(500).send('Failed to delete PNG.');
        }
    }

    try {
    const pool = await getAuthPool();
    const slotIdString = `${slot}_body`;

    await pool.request()
        .input('serverKey', sql.VarChar, serverKey)
        .input('containerId', sql.Int, containerId)
        .input('slotId', sql.VarChar, slotIdString)
        .query(`
        DELETE FROM cohauth.dbo.CostumeHash
        WHERE ServerKey = @serverKey AND ContainerId = @containerId AND SlotId = @slotId
        `);

        console.log(`[INFO] Deleted costume hash for ${containerId} slot ${slot}`);
        req.flash('success', 'Costume render cleared successfully.');
    } catch (err) {
        console.error('[ERROR] Failed to delete hash:', err);
        req.flash('error', 'Error clearing hash.');
        return res.redirect(req.get('Referrer') || '/');
    }


    return res.redirect(req.get('Referrer') || '/');
};
