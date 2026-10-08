// V6.2: the welcome page lives at "/", the app at "/app/". Links the app makes always point here.
export const APP_PATH = '/app/'
export const appUrl = (rest = '') => `${location.origin}${APP_PATH}${rest}`
