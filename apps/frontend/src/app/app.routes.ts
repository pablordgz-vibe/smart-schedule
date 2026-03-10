import { Routes } from '@angular/router';
import { ShellComponent } from './shell/shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', loadComponent: () => import('./home').then((m) => m.HomeComponent) },
      {
        path: 'calendar',
        loadComponent: () => import('./calendar').then((m) => m.CalendarComponent),
      },
      { path: 'tasks', loadComponent: () => import('./tasks').then((m) => m.TasksComponent) },
      {
        path: 'schedules',
        loadComponent: () => import('./schedules').then((m) => m.SchedulesComponent),
      },
    ],
  },
  {
    path: 'setup',
    loadComponent: () => import('./setup/setup.component').then((m) => m.SetupComponent),
  },
];
