// (c) Bkram 2024
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const cheerio = require('cheerio');
const axios = require('axios');

/**
 * Fetch tuner information from the provided URL. It first tries the
 * `/static_data` endpoint which exposes the server description in JSON.
 * The JSON is used mainly to determine the active antenna index, while
 * antenna names are scraped from the HTML page.
 *
 * @param {string} url - The URL of the web server.
 * @returns {Object} An object containing tuner name, description,
 * antenna names and the currently active antenna index when available.
 */
async function getTunerInfo(url) {
    const baseUrl = new URL(url);
    const staticUrl = new URL('static_data', baseUrl).toString();

    let tunerName = '';
    let tunerDesc = '';
    let activeAnt;
    let antNames = [];

    try {
        const res = await axios.get(staticUrl);
        const data = res.data || {};
        tunerName = data.tunerName || '';
        tunerDesc = data.tunerDesc || '';
        const antObj = data.ant || {};
        activeAnt =
            data.antSel !== undefined
                ? Number(data.antSel)
                : data.activeAnt !== undefined
                ? Number(data.activeAnt)
                : antObj.active !== undefined
                ? Number(antObj.active)
                : undefined;
    } catch (err) {
        // ignore errors fetching static data
    }

    try {
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
            const list = $('#data-ant ul.options li, #data-ant li');
            list.each((_, el) => {
                const name = $(el).text().trim();
                if (name) antNames.push(name);
            });
            if (antNames.length === 0) {
                if ($('#data-ant-container').length || $('#data-ant').length) {
                    antNames.push('Default');
                }
            }
        }

        if (activeAnt === undefined) {
            const placeholder = $('#data-ant input').attr('placeholder') || '';
            const match = placeholder.match(/Ant\s*([A-Z])/i);
            if (match) {
                activeAnt = match[1].charCodeAt(0) - 'A'.charCodeAt(0);
            } else if (antNames.length > 0) {
                activeAnt = 0;
            }
        }
    } catch (error) {
        console.error('tunerinfo error:', error.message);
        return { tunerName: '', tunerDesc: '', antNames: ['Default'], activeAnt: 0 };
    }

    if (antNames.length === 0) {
        antNames.push('Default');
    }
    if (activeAnt === undefined) activeAnt = 0;

    return { tunerName, tunerDesc, antNames, activeAnt };
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
        if (!pingUrl.pathname.endsWith('/')) {
            pingUrl.pathname += '/';
        }
        pingUrl.pathname += 'ping';
        const startTime = Date.now();

        const headers = {};

        await axios.get(pingUrl.toString(), { headers });
        const endTime = Date.now();
        const pingTime = endTime - startTime;
        return pingTime;
    } catch (error) {
        throw new Error('Failed to fetch ping: ' + error.message);
    }
}

module.exports = { getTunerInfo, getPingTime };
