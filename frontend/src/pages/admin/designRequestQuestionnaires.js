const availability = ["Available", "Pending", "To Be Shared"];
const yesNo = ["Yes", "No"];

export const designRequestTypes = ["New design", "Existing design"];
export const designRequestTypeLabel = "Design request type";
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const internationalCountries = (`
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE
  BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD
  CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM
  DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF
  GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU
  ID IE IL IM IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP
  KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF
  MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC
  NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN
  PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ
  SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL
  TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN
  VU WF WS YE YT ZA ZM ZW
`).trim().split(/\s+/).map(code => countryNames.of(code)).sort((a, b) => a.localeCompare(b, "en"));

export const targetMarkets = {
  Domestic: [
    "Pan-India", "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
    "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  ],
  International: internationalCountries,
};

export const designRequestQuestionnaires = {
  packaging: {
    label: "Packaging",
    fields: [
      {
        name: "packaging_format",
        label: "What is the required packaging format?",
        options: ["Bottle", "Jar", "Pouch", "Box", "Tin", "Sachet", "Other"],
        note: { label: "Specify the packaging format", when: ["Other"] },
      },
      {
        name: "kld",
        label: "Is the KLD (Keyline Drawing) available?",
        options: ["Yes", "No", "To Be Shared"],
        upload: "KLD files",
      },
      {
        name: "sku_size",
        label: "What is the required SKU size?",
        options: ["50g", "100g", "200g", "500g", "1kg", "100ml", "200ml", "500ml", "Other"],
        note: { label: "Specify the SKU size", when: ["Other"] },
      },
      {
        name: "packaging_reference",
        label: "Is any reference image or sample available?",
        options: yesNo,
        upload: "reference images or samples",
      },
      {
        name: "colour",
        label: "Do you have any preferred colour scheme?",
        options: ["Existing Brand Colours", "Specific Colour Preference", "Open to Creative Suggestions"],
        note: { label: "Specify the preferred colours", when: ["Specific Colour Preference"] },
      },
      { name: "audience_region", label: "Region", type: "markets", group: "Target audience" },
      { name: "audience_gender", label: "Gender", options: ["Male", "Female", "Both"], group: "Target audience" },
      { name: "audience_age", label: "Age Group", type: "ageRanges", group: "Target audience" },
      { name: "mrp", label: "What is the MRP of the product? (₹)", type: "number" },
      {
        name: "specifications",
        label: "Are there any additional design specifications?",
        options: yesNo,
        note: { label: "Additional design specifications", when: ["Yes"] },
      },
    ],
  },
  label: {
    label: "Labelling",
    instructions: "Please attach the finalised label information, including all applicable declarations and disclaimers, in the Labelling documents section below.",
    fields: [
      { name: "ingredients", label: "Final Ingredients List", options: availability },
      { name: "nutrition", label: "Nutritional Information Table", options: availability },
      {
        name: "fssai",
        label: "FSSAI Declarations & Disclaimers",
        options: ["Verified", "Pending with Regulatory Team", "Not Applicable"],
      },
      {
        name: "manufacturing",
        label: "Manufacturing & Mandatory Details",
        options: ["Fully Available", "Partially Available", "Pending"],
      },
      {
        name: "claims",
        label: "Additional Claims & Certifications",
        options: ["Available", "Pending", "Not Applicable"],
      },
      { name: "labelling_instructions", label: "Other Labelling Instructions", type: "textarea" },
    ],
    upload: {
      name: "labelling_documents",
      label: "Attach labelling documents (optional)",
      help: "Include the ingredients list, nutritional table, FSSAI declarations, manufacturing details, claims, certifications, and any other relevant labelling instructions.",
    },
  },
  logo: {
    label: "Brand Identity & Branding",
    fields: [
      {
        name: "logo_requirement",
        label: "What is the logo requirement?",
        options: ["New Logo", "Existing Logo", "Logo Modification"],
      },
      {
        name: "collaterals",
        label: "Are additional collaterals required?",
        options: ["Visiting Cards", "Letterheads", "T-Shirts", "Stationery", "Other", "Not Required"],
        note: { label: "Specify the collaterals", when: ["Other"] },
      },
      {
        name: "machine_branding",
        label: "Is machine or equipment branding required?",
        options: ["Vinyl Stickers", "Signage", "Machine Branding", "Other", "Not Required"],
        note: { label: "Specify the equipment branding", when: ["Other"] },
      },
      {
        name: "marketing_material",
        label: "What type of marketing material is required?",
        options: ["Print", "Digital", "Both", "Not Required", "Other"],
        note: { label: "Specify the marketing material", when: ["Other"] },
      },
      {
        name: "catalogue",
        label: "Is a catalogue required?",
        options: ["Product Catalogue", "Company Catalogue", "Both", "Not Required"],
      },
      {
        name: "brand_guidelines",
        label: "Are brand guidelines available?",
        options: [...yesNo, "To Be Shared"],
        upload: "brand guidelines",
      },
      {
        name: "branding_reference",
        label: "Is any design reference available?",
        options: yesNo,
        upload: "design references",
      },
    ],
  },
  trademark: {
    label: "Trademarks & Copyrights",
    fields: [
      {
        name: "trademark_type",
        label: "What type of trademark filing is required?",
        options: ["Wordmark", "Device Mark", "Both"],
      },
      {
        name: "request_nature",
        label: "What is the nature of the request?",
        options: ["New Filing", "Existing Application Follow-up", "Renewal", "Objection", "Status Update"],
      },
      {
        name: "brand_name_approval",
        label: "Is the final brand name approved?",
        options: [...yesNo, "Pending (Management Approval)"],
      },
      {
        name: "description_available",
        label: "Is the product or company description available?",
        options: [...yesNo, "To Be Prepared"],
      },
      {
        name: "trademark_documents",
        label: "Are supporting documents available?",
        options: [...yesNo, "Partially Available"],
        upload: "supporting documents",
      },
    ],
  },
};

function readTargetMarket(input) {
  const market = input.get("audience_region");
  if (!Object.hasOwn(targetMarkets, market)) throw new Error("Select Domestic or International for Region.");
  const locations = input.getAll("audience_location");
  if (!locations.length || locations.some(location => !targetMarkets[market].includes(location))) {
    throw new Error("Select at least one location for the target region.");
  }
  const extra = String(input.get("audience_region_details") || "").trim();
  return [market, [...new Set(locations)].join(", "), extra].filter(Boolean).join(" · ");
}

function readAgeRanges(input) {
  const from = input.getAll("audience_age_from");
  const to = input.getAll("audience_age_to");
  if (!from.length || from.length !== to.length) throw new Error("Enter at least one age range.");
  return from.map((start, index) => {
    const end = to[index];
    if (![start, end].every(value => typeof value === "string" && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) ||
        Number(start) > Number(end)) {
      throw new Error(`Age range ${index + 1} needs whole numbers with the starting age at or below the ending age.`);
    }
    return `${Number(start)}–${Number(end)} years`;
  }).join(", ");
}

export function buildDesignRequestPayload(input, additionalFiles = []) {
  const category = input.get("category");
  const questionnaire = designRequestQuestionnaires[category];
  if (!Object.hasOwn(designRequestQuestionnaires, category)) throw new Error("Select a request category.");
  const requestType = input.get("design_request_type");
  if (!designRequestTypes.includes(requestType)) throw new Error("Select New design or Existing design.");
  const title = String(input.get("title") || "").trim();
  const neededBy = String(input.get("needed_by") || "").trim();
  if (!title) throw new Error("Enter a request title.");
  if (!neededBy) throw new Error("Select a Needed by date.");
  const payload = new FormData();
  const brief = [`${designRequestTypeLabel}\n${requestType}`];
  const fileLabels = [];

  payload.set("category", category);
  payload.set("title", title);
  payload.set("needed_by", neededBy);

  const attachFiles = (files, label, question = label) => {
    if (files.length === 0) return;
    for (const file of files) {
      payload.append("files", file);
      fileLabels.push(question);
    }
    brief.push(`${label}\n${files.map(file => file.name.slice(0, 255)).join(", ")}`);
  };
  const fieldFiles = name => input.getAll(`${name}_files`).filter(file => file.name);

  for (const field of questionnaire.fields) {
    const answer = field.type === "markets" ? readTargetMarket(input)
      : field.type === "ageRanges" ? readAgeRanges(input) : String(input.get(field.name) || "").trim();
    if (!answer || (field.options && !field.options.includes(answer))) throw new Error(`Complete this required field: ${field.label}`);
    brief.push(`${field.label}\n${answer}`);
    if (field.note && (!field.note.when || field.note.when.includes(answer))) {
      const note = String(input.get(`${field.name}_note`) || "").trim();
      if (!note) throw new Error(`Complete this required field: ${field.note.label}`);
      brief.push(`${field.note.label}\n${note}`);
    }
    if (field.upload) attachFiles(fieldFiles(field.name), field.upload, field.label);
  }
  if (questionnaire.upload) attachFiles(fieldFiles(questionnaire.upload.name), "Labelling documents");
  attachFiles(additionalFiles, "Additional attachments");

  const context = String(input.get("brief") || "").trim();
  if (context) brief.push(`Additional brief\n${context}`);

  const files = payload.getAll("files");
  if (files.length > 5 || files.some(file => file.size > 10 * 1024 * 1024)) {
    throw new Error("Attach up to 5 files per request, 10 MB each.");
  }
  const storedBrief = brief.join("\n\n");
  if (storedBrief.length > 8000) throw new Error("The request brief is too long. Shorten the additional notes and try again.");
  payload.set("brief", storedBrief);
  if (fileLabels.length) payload.set("file_labels", JSON.stringify(fileLabels));
  return payload;
}
