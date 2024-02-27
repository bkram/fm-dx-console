// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const cheerio = require('cheerio');
const axios = require('axios');

/**
 * Remove all occurrences of specified substrings from a string.
 * @param {string} str - The string to remove occurrences from.
 * @param {string[]} substrArray - An array of substrings to remove.
 * @returns {string} The string with all occurrences of the substrings removed.
 */
function removeSubstr(str, substrArray) {
    substrArray.forEach(substr => {
        while (str.includes(substr)) {
            str = str.replace(substr, '');
        }
    });
    return str;
}

/**
 * Remove non-Latin characters from a string.
 * @param {string} str - The string to remove non-Latin characters from.
 * @returns {string} The string with only Latin characters.
 */
function removeNonLatinCharacters(str) {
    // Regular expression to match Latin characters
    const latinRegex = /[^\u0000-\u007F]/g;
    return str.replace(latinRegex, '');
}

/**
 * Remove all double spaces from a string without using regular expressions.
 * @param {string} str - The string to remove double spaces from.
 * @returns {string} The string with all double spaces replaced with a single space.
 */
function removeDoubleSpaces(str) {
    // Split the string by space, filter out empty elements (consecutive spaces), and join back with single space
    return str.split(' ').filter(Boolean).join(' ');
}

async function getTunerInfo(url) {
    try {
        const response = await axios.get(url); // Asynchronous HTTP request using axios
        const html = response.data;
        const $ = cheerio.load(html);

        // Extract the content of <p> tags with specific IDs
        let tunerName = $('#tuner-name').text().trim();
        let tunerDesc = $('#tuner-desc').text().trim();

        // Define substrings to be removed
        const substrToRemove = ['**', '??'];

        // Remove all occurrences of specified substrings
        tunerName = removeSubstr(tunerName, substrToRemove);
        tunerDesc = removeSubstr(tunerDesc, substrToRemove);

        // Remove non-Latin characters
        tunerName = removeNonLatinCharacters(tunerName);
        tunerDesc = removeNonLatinCharacters(tunerDesc);

        // Remove all double spaces
        tunerName = removeDoubleSpaces(tunerName);
        tunerDesc = removeDoubleSpaces(tunerDesc);

        // Split on '\n' and take only the first part
        tunerName = tunerName.split('\\n')[0];
        tunerDesc = tunerDesc.split('\\n')[0];

        // Limit the length to 78 characters after removing substrings, non-Latin characters, and double spaces
        tunerName = tunerName.slice(0, 78);
        tunerDesc = tunerDesc.slice(0, 78);
        return { tunerName, tunerDesc };
    } catch (error) {
        throw new Error('Failed to fetch content: ' + error.message);
    }
}

async function getPingTime(url) {
    try {
        const pingUrl = new URL((url));
        pingUrl.pathname = 'ping';
        const startTime = Date.now(); // Record start time
        const response = await axios.get(pingUrl); // Asynchronous HTTP request using axios
        const endTime = Date.now(); // Record end time
        const pingTime = endTime - startTime; // Calculate time difference
        return pingTime;
    } catch (error) {
        throw new Error('Failed to fetch ping: ' + error.message);
    }
}

module.exports = { getTunerInfo, getPingTime };
