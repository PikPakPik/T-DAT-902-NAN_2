import {
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    ButtonModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  #router = inject(Router);

  readonly isDark = signal(
    typeof localStorage !== 'undefined' &&
      localStorage.getItem('homepedia-ui-theme') === 'dark',
  );

  constructor() {
    this.#syncThemeToDocument();
  }

  toggleDarkMode(): void {
    this.isDark.update((v) => !v);
    this.#syncThemeToDocument();
  }

  navigate(url: string): void {
    void this.#router.navigateByUrl(url);
  }

  #syncThemeToDocument(): void {
    const dark = this.isDark();
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('homepedia-ui-theme', dark ? 'dark' : 'light');
    }
  }
}
