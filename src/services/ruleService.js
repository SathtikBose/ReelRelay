const { Reel } = require("../models/Reel");
const { NotFoundError, ConflictError } = require("../lib/errors");

/**
 * Finds an active or inactive reel rule by Instagram media ID
 * @param {string} mediaId
 * @returns {Promise<InstanceType<typeof Reel> | null>}
 */
async function findRuleByMediaId(mediaId) {
  if (!mediaId) return null;
  return Reel.findOne({ mediaId: String(mediaId).trim() });
}

/**
 * Finds a rule by MongoDB ObjectId
 * @param {string} id
 * @returns {Promise<InstanceType<typeof Reel>>}
 */
async function findRuleById(id) {
  const rule = await Reel.findById(id);
  if (!rule) {
    throw new NotFoundError(`Reel rule not found with ID ${id}`);
  }
  return rule;
}

/**
 * Lists all reel rules
 * @param {object} [filter={}]
 * @returns {Promise<Array<InstanceType<typeof Reel>>>}
 */
async function listRules(filter = {}) {
  return Reel.find(filter).sort({ createdAt: -1 });
}

/**
 * Creates a new reel rule
 * @param {object} data
 * @returns {Promise<InstanceType<typeof Reel>>}
 */
async function createRule(data) {
  const existing = await Reel.findOne({ mediaId: data.mediaId });
  if (existing) {
    throw new ConflictError(`A rule already exists for media ID ${data.mediaId}`);
  }
  return Reel.create(data);
}

/**
 * Updates an existing reel rule
 * @param {string} id
 * @param {object} data
 * @returns {Promise<InstanceType<typeof Reel>>}
 */
async function updateRule(id, data) {
  const rule = await Reel.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!rule) {
    throw new NotFoundError(`Reel rule not found with ID ${id}`);
  }
  return rule;
}

/**
 * Toggles a rule between active and inactive
 * @param {string} id
 * @returns {Promise<InstanceType<typeof Reel>>}
 */
async function toggleRuleActive(id) {
  const rule = await findRuleById(id);
  rule.active = !rule.active;
  await rule.save();
  return rule;
}

/**
 * Deletes a reel rule by ID
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteRule(id) {
  const res = await Reel.findByIdAndDelete(id);
  if (!res) {
    throw new NotFoundError(`Reel rule not found with ID ${id}`);
  }
  return true;
}

module.exports = {
  findRuleByMediaId,
  findRuleById,
  listRules,
  createRule,
  updateRule,
  toggleRuleActive,
  deleteRule,
};
