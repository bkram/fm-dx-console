// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const cheerio = require('cheerio');
const axios = require('axios');

/**
 * Fetch tuner information from the provided URL. It first tries the
 * `/static_data` endpoint which exposes the server description in JSON.
 * If that fails (older servers), it falls back to scraping the HTML page.
 *
 * @param {string} url - The URL of the web server.
 * @returns {Object} An object containing tuner name, description and
 * antenna names.
 */
async function getTunerInfo(url) {
    const base = url.endsWith('/') ? url.slice(0, -1) : url;
    try {
        // Preferred method: fetch JSON info
        const res = await axios.get(`${base}/static_data`);
        const data = res.data || {};
        const tunerName = data.tunerName || '';
        const tunerDesc = data.tunerDesc || '';
        const antObj = data.ant || {};
        const antNames = Object.values(antObj)
            .map((a) => (a && typeof a.name === 'string' ? a.name : ''))
            .filter(Boolean);
        if (antNames.length === 0) antNames.push('Default');
        return { tunerName, tunerDesc, antNames };
    } catch (jsonErr) {
        try {
            // Fallback: scrape HTML
            const response = await axios.get(base);
            const html = response.data;
            const $ = cheerio.load(html);

            const tunerName = $('meta[property="og:title"]').attr('content')
                .replace('FM-DX WebServer ', '');
            let tunerDesc = $('meta[property="og:description"]').attr('content')
                .replace('Server description: ', '')
                .trim();

            const antNames = [];
            $('#data-ant ul.options li, #data-ant li, select[name="ant"] option').each((_, el) => {
                const name = $(el).text().trim();
                if (name) antNames.push(name);
            });
            if (antNames.length === 0) antNames.push('Default');

            return { tunerName, tunerDesc, antNames };
        } catch (error) {
            throw new Error('Failed to fetch content: ' + error.message);
        }
    }
}

/**
 * Fetch ping time from the provided URL.
 * @param {string} url - The URL of the web server.
 * @returns {number} The ping time in milliseconds.
 * @throws {Error} If fetching ping time fails.
 */
async function getPingTime(url) {
    try {
        const pingUrl = new URL(url);
        // Ensure the base path ends with a single slash before appending 'ping'
        if (!pingUrl.pathname.endsWith('/')) {
            pingUrl.pathname += '/';
        }
        pingUrl.pathname += 'ping';
        const startTime = Date.now(); // Record start time

        // Custom headers (if needed)
        const headers = {};

        const response = await axios.get(pingUrl.toString(), { headers }); // Asynchronous HTTP request using axios
        const endTime = Date.now(); // Record end time
        const pingTime = endTime - startTime; // Calculate time difference
        return pingTime;
    } catch (error) {
        throw new Error('Failed to fetch ping: ' + error.message);
    }
}

module.exports = { getTunerInfo, getPingTime };
