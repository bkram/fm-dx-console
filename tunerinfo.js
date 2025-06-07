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
    const baseUrl = new URL(url);
    const staticUrl = new URL('static_data', baseUrl).toString();
    try {
        // Preferred method: fetch JSON info
        const res = await axios.get(staticUrl);
        const data = res.data || {};
        let tunerName = data.tunerName || '';
        let tunerDesc = data.tunerDesc || '';
        const antObj = data.ant || {};
        let antNames = Object.values(antObj)
            .filter(a => a && typeof a === 'object' && a.enabled)
            .map(a => (typeof a.name === 'string' ? a.name : ''))
            .filter(Boolean);

        // If key info is missing, fall back to HTML scraping
        if (!tunerDesc || antNames.length === 0) {
            const response = await axios.get(url);
            const html = response.data;
            const $ = cheerio.load(html);

            if (!tunerName) {
                tunerName = $('meta[property="og:title"]').attr('content')
                    .replace('FM-DX WebServer ', '');
            }
            if (!tunerDesc) {
                tunerDesc = $('meta[property="og:description"]').attr('content')
                    .replace('Server description: ', '')
                    .trim();
            }
            if (antNames.length === 0) {
                antNames = [];
                const list = $('#data-ant ul.options li, #data-ant li');
                list.each((_, el) => {
                    const name = $(el).text().trim();
                    if (name) antNames.push(name);
                });
                if (antNames.length === 0 && $('#data-ant-container').length) {
                    antNames.push('Default');
                }
            }
        }

        return { tunerName, tunerDesc, antNames };
    } catch (error) {
        console.error('tunerinfo error:', error.message);
        return { tunerName: '', tunerDesc: '', antNames: [] };
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
