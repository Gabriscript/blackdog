// craco exists only for the "@/" import alias (shadcn convention).
const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
};
