// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const cheerio = require('cheerio');
const axios = require('axios');

/**
 * Fetch tuner information from the provided URL.
 * @param {string} url - The URL of the web server.
 * @returns {Object} An object containing tuner name and description.
 * @throws {Error} If fetching tuner information fails.
 */
async function getTunerInfo(url) {
    try {
        const response = await axios.get(url); // Asynchronous HTTP request using axios
        const html = response.data;
        const $ = cheerio.load(html);

        // Extract and clean the og:title
        const tunerName = $('meta[property="og:title"]').attr('content')
            .replace('FM-DX WebServer ', '')  // Remove "FM-DX WebServer "
            // .replace('[', ' ')                 // Remove "["
            // .replace(']', ' ');                // Remove "]"

        // Extract and clean the og:description
        let tunerDesc = $('meta[property="og:description"]').attr('content')
            .replace('Server description: ', '')  // Remove "Server description:"
            .trim();  // Remove leading and trailing whitespace

        // Add a space to the beginning of each line in the description
        if (tunerDesc) {
            tunerDesc = tunerDesc;
            // tunerDesc = tunerDesc
            //     .split(/\r?\n/)  // Split by either \n or \r\n (handles different OS newline formats)
            //     .map(line => ' ' + line.trim())  // Add a space and remove extra whitespace at the beginning of each line
            //     .slice(0, 10)  // Keep only the first 3 lines
            //     .join('\n')  // Join the lines back with \n
            //     .replace(/\.\s*$/, '');  // Remove any trailing period followed by optional spaces
        }

        const antNames = [];
        $('#data-ant ul.options li').each((index, element) => {
            antNames.push($(element).text().trim());
        });

        if (antNames.length === 0) {
            antNames.push('Default');
        }
        return { tunerName, tunerDesc, antNames };
    } catch (error) {
        throw new Error('Failed to fetch content: ' + error.message);
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
