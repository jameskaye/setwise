import React from 'react';
import {renderToString} from 'react-dom/server';
import WorkoutApp from '../app/workout-app';
import {createPreviewData} from './data';
export function renderReview(){return renderToString(<><div className="review-banner">PREVIEW<span>Layout shown below. Interactive controls require JavaScript.</span></div><WorkoutApp initialData={createPreviewData()}/></>);}
