'use strict';

const ALLOWED_VERTICALS = Object.freeze(['auction', 'marketplace', 'wholesale', 'home']);
const FCM_TOPIC_PREFIX = 'vertical-launch-';

module.exports = { ALLOWED_VERTICALS, FCM_TOPIC_PREFIX };
