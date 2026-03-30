import { Routes } from '@angular/router';
import { ListComponent } from './pages/list/list.component';
import { EditComponent } from './pages/edit/edit.component';

export const routes: Routes = [
  { path: '', component: ListComponent },
  { path: 'edit/:id', component: EditComponent },
  { path: '**', redirectTo: '' }
];
