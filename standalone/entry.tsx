import {createRoot} from 'react-dom/client';
import WorkoutApp from '../app/workout-app';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<WorkoutApp/>);

if('serviceWorker' in navigator)window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js').catch(()=>{});});
