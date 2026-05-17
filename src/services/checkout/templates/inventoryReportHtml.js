'use strict';

/**
 * checkout/templates/inventoryReportHtml.js
 *
 * Pure HTML builder for the inventory update report email.
 * Extracted from shared/inventory.js (PR email-template-extract).
 *
 * Accepts plain data only — no DB calls, no env reads, no logging.
 */

/**
 * @param {object} p
 * @param {string} p.logoUrl
 * @param {Array<{ productName: string, variantId: string|number, qtySold: number, qtyRemaining: number, updateStatus: string }>} p.emailDetails
 * @returns {string}
 */
function buildInventoryReportHtml(p) {
    const { logoUrl, emailDetails } = p;

    return `
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://www.bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Product Quantity Update Report</b></p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">The following products have been updated in the inventory:</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <thead style="text-align: center;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Product Name</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Variant ID</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Quantity Sold</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Quantity Remaining</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Update Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                    ${emailDetails
                                                      .map(
                                                        (item) => `
                                                        <tr>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.productName}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.variantId}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.qtySold}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.qtyRemaining}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.updateStatus}</td>
                                                        </tr>
                                                    `
                                                      )
                                                      .join('')}
                                                </tbody>
                                            </table>
                                            <p style="margin-top:20px;">Please log in to the dashboard to confirm the updates.</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0; padding-left: 15px; padding-right: 15px;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </body>`;
}

module.exports = { buildInventoryReportHtml };
