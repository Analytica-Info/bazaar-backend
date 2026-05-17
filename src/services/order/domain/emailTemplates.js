'use strict';

function buildAdminOrderEmailHtml(params) {
    const { logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        amount_subtotal, formattedshippingCost, discount_amount_long, discount_amount, total,
        name, userEmail, address, city, area, buildingName, floorNo, apartmentNo, landmark, phone } = params;

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
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>To be delivered before:</b> ${formattedDeliveryDate}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>A new order has been placed on Bazaar.</b></p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Below are the order details:</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Please review and process the order at your earliest convenience.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Thank you for your continued support in ensuring excellent service for our customers.</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; width:100%;">
                                                <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="min-width:600px; text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <thead style="text-align: center;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                        ${purchaseDetails}
                                                    </tbody>

                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${amount_subtotal}</b></th>
                                                        </tr>
                                                    </thead>

                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                        </tr>
                                                    </thead>

                                                    ${discount_amount_long > 0 ? `
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED -${discount_amount}</b></th>
                                                        </tr>
                                                    </thead>
                                                    ` : ''}
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${total.toFixed(2)}</b></th>
                                                        </tr>
                                                    </thead>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Customer Information</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${userEmail}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Address: ${address}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${landmark != null ? String(landmark) : '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${phone}</p>
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
                            </td>
                        </tr>
                    </table>
                </body>`;
}

function buildUserOrderEmailHtml(params) {
    const { logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        amount_subtotal, formattedshippingCost, discount_amount_long, discount_amount, total,
        name, userEmail, address, city, area, buildingName, floorNo, apartmentNo, landmark, phone } = params;

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
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>Get it By:</b> ${formattedDeliveryDate}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>${name}</b>! Thank you for your order with Bazaar!</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">We have received your order and are processing it. Below are the details of your purchase</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">If you have any questions about your order, feel free to reply to this email or contact our support team.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">We appreciate your business and look forward to serving you again soon!</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div style="overflow-x:auto; -webkit-overflow-scrolling: touch; width:100%;">
                                                <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="min-width:600px; text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <thead style="text-align: center;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                        ${purchaseDetails}
                                                    </tbody>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${amount_subtotal}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED -${discount_amount}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${total.toFixed(2)}</b></th>
                                                        </tr>
                                                    </thead>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>

                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Billing Details</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${userEmail}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Address: ${address}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${landmark != null ? String(landmark) : '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${phone}</p>
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
                            </td>
                        </tr>
                    </table>
                </body>`;
}

function buildWebhookAdminEmailHtml(params) {
    const { logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        formattedshippingCost, formatted_subtotal_amount, discount_amount_long, discount_amount, amount_total,
        orderData } = params;

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
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>To be delivered before:</b> ${formattedDeliveryDate}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>A new order has been placed on Bazaar.</b></p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Below are the order details:</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Please review and process the order at your earliest convenience.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Thank you for your continued support in ensuring excellent service for our customers.</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; width:100%;">
                                                <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="min-width:600px; text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <thead style="text-align: center;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                        ${purchaseDetails}
                                                    </tbody>

                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                        </tr>
                                                    </thead>
                                                        <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_subtotal_amount}</b></th>
                                                        </tr>
                                                    </thead>

                                                    ${discount_amount_long > 0 ? `
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${discount_amount}</b></th>
                                                        </tr>
                                                    </thead>
                                                    ` : ''}
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${amount_total}</b></th>
                                                        </tr>
                                                    </thead>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Customer Information</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${orderData.name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${orderData.user_email}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Address: ${orderData.address}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${orderData.city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${orderData.area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${orderData.buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${orderData.floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${orderData.apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${orderData.landmark != null ? String(orderData.landmark) : '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${orderData.phone}</p>
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
                            </td>
                        </tr>
                    </table>
                </body>`;
}

function buildWebhookUserEmailHtml(params) {
    const { logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        formattedshippingCost, formatted_subtotal_amount, discount_amount_long, discount_amount, amount_total,
        orderData } = params;

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
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>Get it By:</b> ${formattedDeliveryDate}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>${orderData.name}</b>! Thank you for your order with Bazaar!</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">We have received your order and are processing it. Below are the details of your purchase</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">If you have any questions about your order, feel free to reply to this email or contact our support team.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">We appreciate your business and look forward to serving you again soon!</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div style="overflow-x:auto; -webkit-overflow-scrolling: touch; width:100%;">
                                                <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="min-width:600px; text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <thead style="text-align: center;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                        ${purchaseDetails}
                                                    </tbody>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_subtotal_amount}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${discount_amount}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${amount_total}</b></th>
                                                        </tr>
                                                    </thead>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>

                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Billing Details</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${orderData.name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${orderData.user_email}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Address: ${orderData.address}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${orderData.city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${orderData.area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${orderData.buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${orderData.floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${orderData.apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${orderData.landmark != null ? String(orderData.landmark) : '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${orderData.phone}</p>
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
                            </td>
                        </tr>
                    </table>
                </body>`;
}

module.exports = {
    buildAdminOrderEmailHtml,
    buildUserOrderEmailHtml,
    buildWebhookAdminEmailHtml,
    buildWebhookUserEmailHtml,
};
