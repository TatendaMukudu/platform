/* Person-facing assessment wording is owned by ai/voice.js. This compatibility module preserves the existing API. */
'use strict';
const voice = require('./voice');
module.exports = { project: voice.projectAssessment, isPlaceholderFeedback: voice.isPlaceholderFeedback, answerAboutAssessment: voice.answerAboutAssessment };
