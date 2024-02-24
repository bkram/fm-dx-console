// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const cheerio = require('cheerio');
const axios = require('axios');

/**
 * Fetch tuner information from a specified URL.
 * @param {string} url - The URL of the web server to fetch tuner information from.
 * @returns {Promise<Object>} A promise that resolves to an object containing tuner name and description.
 * @throws {Error} If fetching the content fails.
 */
async function getTunerInfo(url) {
    try {
        const response = await axios.get(url); // Asynchronous HTTP request using axios
        const html = response.data;
        const $ = cheerio.load(html);

        // Extract the content of <p> tags with specific IDs
        let tunerName = $('#tuner-name').text().trim();
        let tunerDesc = $('#tuner-desc').text().trim();
        
        // Limit the length to 78 characters
        tunerName = tunerName.slice(0, 78);
        tunerDesc = tunerDesc.slice(0, 78);

        // Split on '\n' and take only the first part
        tunerName = tunerName.split('\\n')[0];
        tunerDesc = tunerDesc.split('\\n')[0];

        // Remove all occurrences of '**'
        while (tunerName.includes('**')) {
            tunerName = tunerName.replace('**', '');
        }
        while (tunerDesc.includes('**')) {
            tunerDesc = tunerDesc.replace('**', '');
        }

        return { tunerName, tunerDesc };
    } catch (error) {
        throw new Error('Failed to fetch content: ' + error.message);
    }
}

module.exports = getTunerInfo;
