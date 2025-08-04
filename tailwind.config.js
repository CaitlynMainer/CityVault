// tailwind.config.js

console.log("[Tailwind] Loaded config.");

module.exports = {
  darkMode: 'class',
  content: [
    "./views/**/*.ejs",
    "./*.ejs",
    "./**/*.ejs",
    "./public/js/**/*.js"
  ],
  safelist: [
    'bg-red-600',
	'bg-yellow-900',
	'text-white',
	'text-yellow-100',
	'border-yellow-700',
    'rounded',
	'p-4', 'mb-6',
	'shadow', 'text-center',
	'dark:bg-gray-900',
	'group-hover:opacity-100',
    'group-hover:visible',
    'opacity-0',
    'invisible',
    'transition-opacity',
    'transition-[visibility]',
  ],
  theme: {
    extend: {
      fontFamily: {
        paragon: ['Paragon', 'serif'],
      },
    },
  },
  plugins: [],
}
