'use strict';
// TODO: BUG-013 — logStatusFalseItems has unreachable response-shape branches.
// Deferred to PR-MOD-8 cleanup. Do not add new call-sites until cleaned up.

const fs = require('fs');
const path = require('path');
const logger = require('../../../utilities/logger');

/**
 * Logs any items with status === false to a markdown file.
 * Internal diagnostic helper — not exported in public API.
 */
const logStatusFalseItems = (endpoint, requestData, responseData) => {
  try {
    let products = [];
    if (responseData && typeof responseData === 'object') {
      if (responseData.products) products = responseData.products;
      else if (responseData.filteredProducts)
        products = responseData.filteredProducts;
      else if (responseData.data && responseData.data.products)
        products = responseData.data.products;
      else if (responseData.data && Array.isArray(responseData.data)) {
        responseData.data.forEach((item) => {
          if (item.products && Array.isArray(item.products)) {
            products = products.concat(item.products);
          }
        });
      } else if (responseData.product && responseData.id) {
        products = [responseData];
      } else if (Array.isArray(responseData)) products = responseData;
    }

    const falseStatusItems = products.filter(
      (item) => item && item.status === false
    );

    if (falseStatusItems.length > 0) {
      const logFilePath = path.join(__dirname, '../../../status_false_log.md');
      const timestamp = new Date().toISOString();

      let logContent = `\n---\n## STATUS FALSE ITEM DETECTED\n\n`;
      logContent += `**Timestamp:** ${timestamp}\n\n`;
      logContent += `**API Endpoint:** ${endpoint}\n\n`;
      logContent += `**Request Data:**\n\`\`\`json\n${JSON.stringify(
        requestData || {},
        null,
        2
      )}\n\`\`\`\n\n`;
      logContent += `**False Status Items Found:** ${falseStatusItems.length}\n\n`;

      falseStatusItems.forEach((item, index) => {
        logContent += `### Item ${index + 1}:\n`;
        logContent += `- **ID:** ${item._id || item.id || 'N/A'}\n`;
        logContent += `- **Product ID:** ${item.product?.id || 'N/A'}\n`;
        logContent += `- **Name:** ${item.product?.name || 'N/A'}\n`;
        logContent += `- **Status:** ${item.status}\n`;
        logContent += `- **Total Qty:** ${item.totalQty || 'N/A'}\n\n`;
      });

      logContent += `---\n`;

      try {
        if (fs.existsSync(logFilePath)) {
          fs.appendFileSync(logFilePath, logContent);
        } else {
          fs.writeFileSync(
            logFilePath,
            `# Status False Items Log\n\n${logContent}`
          );
        }
        logger.warn(
          { count: falseStatusItems.length, endpoint },
          'ALERT: items with status: false found'
        );
      } catch (fileError) {
        logger.error({ err: fileError }, 'Error writing to status log file:');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in status logging:');
  }
};

module.exports = { logStatusFalseItems };
