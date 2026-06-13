import { onRequestPost as __api_waitlist_js_onRequestPost } from 'C:\\Users\\rober\\Documents\\dev\\BellField\\site\\functions\\api\\waitlist.js';
import { onRequest as __api_waitlist_js_onRequest } from 'C:\\Users\\rober\\Documents\\dev\\BellField\\site\\functions\\api\\waitlist.js';

export const routes = [
  {
    routePath: '/api/waitlist',
    mountPath: '/api',
    method: 'POST',
    middlewares: [],
    modules: [__api_waitlist_js_onRequestPost]
  },
  {
    routePath: '/api/waitlist',
    mountPath: '/api',
    method: '',
    middlewares: [],
    modules: [__api_waitlist_js_onRequest]
  }
];
