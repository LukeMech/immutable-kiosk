/* lang/pl.js -- Settings and the installer in Polish: the dictionary
 * i18n.js translates the English page with (see there for how).
 *
 * EXACT: whole strings (trimmed). PATTERNS: anchored regular expressions,
 * the first that matches wins; the replacement is a string ($1, $2... for
 * the values) or a function, which gets `tr` -- the engine's own translate
 * -- for values that are English themselves (job titles, corner names...).
 * A new language: another file like this one, registered the same way, and
 * a <script> tag for it in index.html before i18n.js.
 */
window.I18N_LANGS = window.I18N_LANGS || {};
window.I18N_LANGS.pl = function (tr) {
    "use strict";
    const PL = { EXACT: {}, PATTERNS: [] };

    Object.assign(PL.EXACT, {
        // ---- release notes (GitHub writes them in English): headings and table headers
        "Package changes": "Zmiany pakietów",
        "Updated": "Zaktualizowane",
        "Added": "Dodane",
        "Removed": "Usunięte",
        "Commits": "Zmiany",
        "Features": "Nowe funkcje",
        "Fixes": "Poprawki",
        "Other changes": "Inne zmiany",
        "Initial build": "Pierwsze wydanie",
        "Notes": "Uwagi",
        "All images": "Wszystkie obrazy",
        "Package": "Pakiet",
        "Previous": "Było",
        "New": "Jest",

        // ---- index.html: top bar, tabs
        "Settings": "Ustawienia",
        "← Back to HMI": "← Wróć do HMI",
        "Network": "Sieć",
        "Display": "Ekran",

        // ---- HMI tab
        "HMI address": "Adres wizualizacji",
        "Loading…": "Wczytywanie…",
        "Server": "Serwer",
        "Beckhoff TwinCAT HMI (TF2000): HTTPS on port 1020 or HTTP on 1010.":
            "Beckhoff TwinCAT HMI (TF2000): HTTPS na porcie 1020 albo HTTP na 1010.",
        "HMI server IP address or name": "Adres IP lub nazwa serwera HMI",
        "e.g. 192.168.1.50": "np. 192.168.1.50",
        "Path": "Ścieżka",
        "Test connection": "Sprawdź połączenie",
        "Save and open HMI": "Zapisz i otwórz HMI",
        "Behavior": "Zachowanie",
        "Accept the HMI server's certificate (self-signed)": "Akceptuj certyfikat serwera HMI (self-signed)",
        "On-screen keyboard in the HMI too": "Klawiatura ekranowa także w HMI",
        "Retry connecting every (s)": "Ponowna próba połączenia co (s)",
        "Save": "Zapisz",
        "HMI zoom": "Powiększenie HMI",
        "The HMI page only. Everything at once: Display → Scaling.":
            "Tylko strona wizualizacji. Wszystko naraz: Ekran → Skalowanie ekranu.",
        "No HMI address": "Brak adresu HMI",
        "Enter the HMI server's address to show the HMI.": "Podaj adres serwera HMI, żeby wyświetlić wizualizację.",
        "Not saved — “Save and open HMI”": "Niezapisane — „Zapisz i otwórz HMI”",
        "Testing connection…": "Sprawdzanie połączenia…",
        "Saved HMI address": "Zapisany adres wizualizacji",
        "Saved": "Zapisano",
        "Hold the button longer": "Przytrzymaj przycisk dłużej",

        // ---- Network tab: Wi-Fi
        "On": "Włączone",
        "Disconnect": "Rozłącz",
        "Scan for networks": "Szukaj sieci",
        "Available networks": "Dostępne sieci",
        "Saved networks": "Zapisane sieci",
        "Hidden network": "Sieć ukryta",
        "Network name (SSID)": "Nazwa sieci (SSID)",
        "Password": "Hasło",
        "Connect": "Połącz",
        "No Wi-Fi adapter": "Brak karty Wi-Fi",
        "The tablet reports no Wi-Fi adapter.": "Tablet nie zgłasza żadnego adaptera Wi-Fi.",
        "Wi-Fi is off": "Wi-Fi wyłączone",
        "Turn it on with the switch next to the title.": "Włącz przełącznikiem obok tytułu.",
        "Connecting…": "Łączenie z siecią…",
        "Not connected": "Nie połączono",
        "Pick a network from the list below.": "Wybierz sieć z listy poniżej.",
        "No networks in range.": "W pobliżu nie widać żadnej sieci.",
        "Scanning for networks…": "Szukanie sieci…",
        "Couldn't read Wi-Fi": "Nie udało się odczytać Wi-Fi",
        "No other networks found.": "Nie znaleziono innych sieci.",
        "Wi-Fi is off.": "Wi-Fi jest wyłączone.",
        "saved": "zapisana",
        "Saved — connects with the remembered password.": "Zapisana — połączy się z zapamiętanym hasłem.",
        "Other password": "Inne hasło",
        "This can take up to a minute.": "To może potrwać do minuty.",
        "No saved networks.": "Brak zapisanych sieci.",
        "active": "aktywna",
        "Forget": "Zapomnij",
        "Disconnecting…": "Rozłączanie z sieci…",
        "Couldn't disconnect": "Nie udało się rozłączyć",
        "Turning Wi-Fi on…": "Włączanie Wi-Fi…",
        "Turning Wi-Fi off…": "Wyłączanie Wi-Fi…",
        "Couldn't turn Wi-Fi on": "Nie udało się włączyć Wi-Fi",
        "Couldn't turn Wi-Fi off": "Nie udało się wyłączyć Wi-Fi",

        // ---- Network tab: IP
        "Connection": "Połączenie",
        "Couldn't read the network": "Nie udało się odczytać sieci",
        "IP address": "Adres IP",
        "No connection": "Brak połączenia",
        "Join a Wi-Fi network below or plug in a cable (USB-Ethernet adapter).":
            "Połącz się z siecią Wi-Fi poniżej albo podłącz kabel (adapter USB-Ethernet).",
        "Waiting for an IP address…": "Czekam na adres IP…",
        "Gateway": "Brama",
        "Interface": "Interfejs",
        "IPv4 addressing": "Adresowanie IPv4",
        "Automatic (DHCP)": "Automatycznie (DHCP)",
        "Static address": "Statyczny adres",
        "Mask (prefix)": "Maska (prefiks)",
        "Apply": "Zastosuj",
        "Applied. Reconnecting…": "Zastosowano. Połączenie jest odnawiane…",

        // ---- Display tab
        "Brightness": "Jasność",
        "Accent color": "Kolor akcentu",
        "Buttons, switches and highlights in Settings.": "Przyciski, przełączniki i zaznaczenia w ustawieniach.",
        "Blue": "Niebieski",
        "Teal": "Morski",
        "Green": "Zielony",
        "Purple": "Fioletowy",
        "Pink": "Różowy",
        "Orange": "Pomarańczowy",
        "Graphite": "Grafitowy",
        "Orientation": "Orientacja",
        "Device default": "Domyślna urządzenia",
        "Portrait": "Pion",
        "Landscape": "Poziom",
        "Rotating the boot screen…": "Obracanie ekranu startowego…",
        "Boot screen rotated": "Ekran startowy obrócony",
        "Couldn't rotate the boot screen": "Nie udało się obrócić ekranu startowego",
        "Resolution and scaling": "Rozdzielczość i skalowanie",
        "Scaling enlarges everything: the HMI, Settings and the keyboard. HMI zoom (HMI tab) is multiplied by it.":
            "Skalowanie powiększa wszystko: HMI, ustawienia i klawiaturę. Powiększenie HMI (zakładka HMI) mnoży się przez tę wartość.",
        "Resolution": "Rozdzielczość",
        "The built-in screen's mode. Default is the one the panel reports as preferred.":
            "Tryb wbudowanego ekranu. Domyślna to tryb, który panel sam podaje jako właściwy.",
        "Default": "Domyślna",
        "Opening Settings from the HMI": "Wejście do ustawień z HMI",
        "Hold the chosen screen corner for about 1 s.": "Przytrzymaj ok. 1 s wybrany róg ekranu.",
        "↖ Top left": "↖ Lewy górny",
        "↗ Top right": "↗ Prawy górny",
        "↙ Bottom left": "↙ Lewy dolny",
        "↘ Bottom right": "↘ Prawy dolny",
        "↖ top left": "↖ lewy górny",
        "↗ top right": "↗ prawy górny",
        "↙ bottom left": "↙ lewy dolny",
        "↘ bottom right": "↘ prawy dolny",

        // ---- System tab: system, update, channel, custom image
        "Updates": "Aktualizacja",
        "Update": "Aktualizuj",
        "Hold: restart now": "Przytrzymaj: uruchom ponownie teraz",
        "Check for updates": "Sprawdź aktualizacje",
        "Update channel": "Kanał aktualizacji",
        "Stable": "Stabilny",
        "Testing (dev)": "Testowy (dev)",
        "Stable: tested releases. Testing: every change right away.": "Stabilny: sprawdzone wydania. Testowy: każda zmiana od razu.",
        "Custom image: pick a channel to get updates again.": "Własny obraz: wybierz kanał, by wrócić do aktualizacji.",
        "Custom system image": "Własny obraz systemu",
        "Only images signed with the ghcr.io/lukemech key.": "Tylko obrazy podpisane kluczem ghcr.io/lukemech.",
        "Image": "Obraz",
        "Switch": "Przełącz",
        "Changelog (GitHub: owner/name)": "Lista zmian (GitHub: właściciel/nazwa)",
        "Updating the system…": "Aktualizowanie systemu…",
        "Keeps working as usual — the new version starts after a restart.": "Działa normalnie dalej — nowa wersja włączy się po restarcie.",
        "Checking for updates…": "Sprawdzanie aktualizacji…",
        "Restoring the previous version…": "Przywracanie poprzedniej wersji…",
        "Progress in the “Recovery” card.": "Postęp w karcie „Odzyskiwanie”.",
        "Updates unavailable": "Aktualizacje są niedostępne",
        "Couldn't check for updates": "Nie udało się sprawdzić aktualizacji",
        "System is up to date": "System jest aktualny",
        "Not checked for updates yet": "Aktualizacje nie były jeszcze sprawdzane",
        "Update failed": "Błąd aktualizacji",
        "skipped": "pominięto",
        "just now": "przed chwilą",
        "Version": "Wersja",
        "Built": "Zbudowany",
        "unavailable": "niedostępny",
        "Linux kernel": "Jądro Linux",
        "Mesa (graphics)": "Mesa (grafika)",
        "What's new": "Co nowego",
        "Changes in this version": "Zmiany w tej wersji",
        "No description.": "Brak opisu.",

        // ---- System tab: language and region
        "Language and region": "Język i region",
        "Language": "Język",
        "Time zone": "Strefa czasowa",
        "City": "Miasto",
        "Host name": "Nazwa w sieci",
        "Lowercase letters, digits and hyphens.": "Małe litery, cyfry i myślniki.",
        "— choose —": "— wybierz —",
        "Africa": "Afryka",
        "America": "Ameryka",
        "Antarctica": "Antarktyda",
        "Arctic": "Arktyka",
        "Asia": "Azja",
        "Atlantic": "Atlantyk",
        "Europe": "Europa",
        "Indian Ocean": "Ocean Indyjski",
        "Pacific": "Pacyfik",
        "Other": "Inne",

        // ---- System tab: device, boot time
        "Device": "Urządzenie",
        "Manufacturer": "Producent",
        "Processor": "Procesor",
        "Memory": "Pamięć",
        "Boot time": "Czas uruchamiania",
        "Boot details": "Szczegóły startu",
        "Boot timeline (seconds since kernel start)": "Przebieg startu (sekundy od startu jądra)",
        "Slowest-starting services": "Najdłużej startujące usługi",
        "Loading boot time…": "Wczytywanie czasu uruchamiania…",
        "Reading this boot's journal": "Czytam dziennik tego startu",
        "No boot data": "Brak danych o starcie",
        "The HMI hasn't shown yet (no address, or the server isn't answering)":
            "HMI jeszcze się nie wyświetliło (brak adresu albo serwer nie odpowiada)",
        "Still booting": "Start jeszcze trwa",
        "Kernel": "Jądro",
        "Services": "Usługi",
        "HMI visible": "HMI widoczne",
        "Connecting to HMI…": "Łączenie z HMI…",
        "Waiting for network…": "Czekam na sieć…",
        "The kiosk switches to the HMI once there's a network and the HMI answers":
            "Kiosk przełączy się na HMI, gdy będzie sieć i HMI odpowie",

        // ---- System tab: recovery, power
        "Recovery": "Odzyskiwanie",
        "Hold: restore previous version": "Przytrzymaj: przywróć poprzednią wersję",
        "Hold: reset everything": "Przytrzymaj: zresetuj wszystko",
        "Couldn't restore": "Nie udało się przywrócić",
        "The previous version starts after a restart": "Poprzednia wersja włączy się po restarcie",
        "Restore unavailable": "Przywracanie niedostępne",
        "The new version didn't start": "Nowa wersja się nie uruchomiła",
        "No previous version": "Brak poprzedniej wersji",
        "Power": "Zasilanie",
        "Hold: restart": "Przytrzymaj: uruchom ponownie",
        "Hold: power off": "Przytrzymaj: wyłącz",
        "Restarting…": "Ponowne uruchamianie…",
        "Shutting down…": "Wyłączanie…",
        "Resetting everything — the kiosk restarts like after installation": "Reset wszystkiego — kiosk uruchomi się jak po instalacji",
        "no data": "brak danych",

        // ---- Installer
        "Installer": "Instalator",
        "Install the kiosk system": "Instalacja systemu kiosku",
        "The system will be copied to the tablet's internal storage.": "System zostanie skopiowany na wewnętrzną pamięć tabletu.",
        "All data on the selected disk will be erased.": "Wszystkie dane na wybranym dysku zostaną usunięte.",
        "Target disk": "Dysk docelowy",
        "Hold 3 s to install": "Przytrzymaj 3 s, aby zainstalować",
        "Installing…": "Instalowanie…",
        "Don't turn off the tablet or remove the USB drive.": "Nie wyłączaj tabletu i nie wyjmuj pendrive'a.",
        "USB drive removed — restart": "Wyjąłem pendrive — uruchom ponownie",
        "Back": "Wróć",
        "Details": "Szczegóły",
        "Size": "Rozmiar",
        "Error": "Błąd",
        "No system image on the drive": "Brak obrazu systemu na nośniku",
        "installation drive": "nośnik instalacyjny",
        "too small": "za mały",
        "internal": "wewnętrzny",
        "external": "zewnętrzny",
        "selected": "wybrany",
        "No disks found.": "Nie znaleziono dysków.",
        "Installed ✔": "Zainstalowano ✔",
        "Installation failed": "Instalacja nieudana",
        "Remove the USB drive, then restart the tablet.": "Wyjmij pendrive, potem uruchom tablet ponownie.",

        // ---- kioskd: errors (toasts, status lines)
        "This screen has no brightness control": "Ten ekran nie ma regulacji jasności",
        "hmi: expected an object": "hmi: oczekiwano obiektu",
        "Protocol must be http or https": "Protokół musi być http lub https",
        "Invalid IP address / host name": "Niepoprawny adres IP / nazwa hosta",
        "Port must be a number": "Port musi być liczbą",
        "Port must be 1-65535": "Port musi być z zakresu 1-65535",
        "Invalid orientation": "Niepoprawna orientacja",
        "Invalid resolution": "Niepoprawna rozdzielczość",
        "Zoom: 50-300%": "Powiększenie: 50-300%",
        "Scaling must be a number": "Skalowanie musi być liczbą",
        "Screen scaling: 100-200%": "Skalowanie ekranu: 100-200%",
        "Repository as owner/name, e.g. LukeMech/immutable-kiosk":
            "Repozytorium w postaci właściciel/nazwa, np. LukeMech/immutable-kiosk",
        "Unknown language": "Nieznany język",
        "Unknown accent color": "Nieznany kolor akcentu",
        "Invalid screen corner": "Niepoprawny róg ekranu",
        "Brightness must be a number": "Jasność musi być liczbą",
        "Enter the network name": "Podaj nazwę sieci",
        "No connection to change": "Brak połączenia do zmiany",
        "Invalid IP address or mask": "Niepoprawny adres IP lub maska",
        "Gateway must be in the same subnet": "Brama musi być w tej samej podsieci",
        "Invalid gateway address": "Niepoprawny adres bramy",
        "Mode must be auto or manual": "Tryb musi być auto lub manual",
        "Request too large": "Za duże zapytanie",
        "Invalid JSON": "Niepoprawny JSON",
        "Expected a JSON object": "Oczekiwano obiektu JSON",
        "Unknown time zone": "Nieznana strefa czasowa",
        "Enter the HMI address": "Podaj adres HMI",
        "Invalid profile": "Niepoprawny profil",
        "Name: 1-63 characters, lowercase letters, digits and hyphens (not first or last)":
            "Nazwa: 1-63 znaki, małe litery, cyfry i myślniki (nie na początku ani końcu)",
        "Unknown orientation": "Nieznana orientacja",
        "Invalid image name (e.g. ghcr.io/lukemech/immutable-kiosk-x86:latest)":
            "Niepoprawna nazwa obrazu (np. ghcr.io/lukemech/immutable-kiosk-x86:latest)",
        "Unknown channel": "Nieznany kanał",
        "bootc is unavailable": "bootc jest niedostępny",
        "Can't tell which image the system runs from": "Nie wiadomo, z jakiego obrazu działa system",
        "There's no previous version": "Nie ma poprzedniej wersji",
        "The system didn't restart — the previous version will start on the next boot":
            "System nie uruchomił się ponownie — poprzednia wersja włączy się przy następnym starcie",
        "Unknown action": "Nieznana akcja",
        "Only available on the installation drive": "Dostępne tylko na nośniku instalacyjnym",
        "No such disk": "Nie ma takiego dysku",
        "This is the drive the installer was started from": "To jest nośnik, z którego uruchomiono instalator",
        "The disk is too small for the system": "Dysk jest za mały na system",

        // ---- kioskd: jobs (titles, stages, steps, details)
        "Checking for updates": "Sprawdzanie aktualizacji",
        "System update": "Aktualizacja systemu",
        "Restoring the previous version": "Przywracanie poprzedniej wersji",
        "Download": "Pobieranie",
        "Preparing locally": "Przygotowanie lokalne",
        "Check for a new version": "Sprawdzenie nowej wersji",
        "Merging the image": "Scalanie obrazu",
        "Deploying the new version": "Wdrażanie nowej wersji",
        "Fetching bound images": "Pobieranie powiązanych obrazów",
        "Removing old versions": "Usuwanie starych wersji",
        "Writing the image to disk": "Zapis obrazu na dysk",
        "Done": "Gotowe",
        "New version available": "Dostępna nowa wersja",
        "The new version starts after a restart": "Nowa wersja zostanie uruchomiona po restarcie",
        "Set the previous version as default": "Ustawienie poprzedniej wersji jako domyślnej",
        "Restart": "Ponowne uruchomienie",
        "The screen goes dark for a moment, then the previous version starts":
            "Ekran na chwilę zgaśnie, potem uruchomi się poprzednia wersja",
        // installer job
        "No system image on the installation drive": "Brak obrazu systemu na nośniku instalacyjnym",
        "Preparing the disk": "Przygotowanie dysku",
        "Copying the system": "Kopiowanie systemu",
        "Verifying the write": "Weryfikacja zapisu",
        "Finishing": "Kończenie",
        "The system image on the USB drive is damaged (decompression error)":
            "Obraz systemu na pendrive jest uszkodzony (błąd dekompresji)",
        "Image checksum mismatch -- the installation drive is damaged":
            "Suma kontrolna obrazu się nie zgadza -- nośnik instalacyjny jest uszkodzony",
        "Verification failed: the data on the disk differs from the image. Try again.":
            "Weryfikacja nieudana: dane na dysku różnią się od obrazu. Spróbuj ponownie.",
        "System installed. Remove the USB drive and restart.": "System zainstalowany. Wyjmij pendrive i uruchom ponownie.",

        // ---- kioskd: boot timeline
        "initrd: system disk found": "initrd: dysk systemowy znaleziony",
        "initrd: file system mounted": "initrd: system plików zamontowany",
        "initrd: ready to switch": "initrd: gotowy do przełączenia",
        "File systems mounted": "Systemy plików zamontowane",
        "System initialization (sysinit)": "Inicjalizacja systemu (sysinit)",
        "Basic services (basic)": "Usługi podstawowe (basic)",
        "NetworkManager started": "NetworkManager uruchomiony",
        "kioskd started": "kioskd uruchomiony",
        "Kiosk (cage) started": "Kiosk (cage) uruchomiony",
        "Boot finished (graphical)": "Start zakończony (graphical)",
        "initramfs start": "Start initramfs",
        "eMMC detected": "eMMC wykryty",
        "GPU ready (i915)": "GPU gotowe (i915)",
        "Switch to the system (switch-root)": "Przełączenie na system (switch-root)",
        "Kiosk: cage starts (plymouth goes away)": "Kiosk: start cage (plymouth znika)",
        "PID 1: SELinux policy": "PID 1: polityka SELinux",
        "PID 1: generators": "PID 1: generatory",
        "PID 1: loading units": "PID 1: wczytanie jednostek",
        "What the boot waited for: file systems mounted (local-fs)":
            "Na co czekał start: do zamontowania systemów plików (local-fs)",
        "What the boot waited for: the kiosk starting (cage)": "Na co czekał start: do startu kiosku (cage)",
        // kiosk-shell / kiosk-splash milestones
        "kiosk-shell: GTK ready": "kiosk-shell: GTK gotowy",
        "kiosk-shell: config and rotation": "kiosk-shell: konfiguracja i obrót",
        "kiosk-shell: window sent": "kiosk-shell: okno wysłane",
        "kiosk-shell: splash (window's first frame)": "kiosk-shell: ekran startowy (pierwsza klatka okna)",
        "kiosk-shell: WebKit loaded": "kiosk-shell: WebKit wczytany",
        "kiosk-shell: first page": "kiosk-shell: pierwsza strona",
        "kiosk-splash: end": "kiosk-splash: koniec",
    });

    // Values inside sentences that are themselves translated.
    const CHANNEL = { stable: "stabilny", testing: "testowy", custom: "własny" };
    const ch = n => CHANNEL[n] || n;
    const ago = a => a === "just now" ? "przed chwilą"
        : a.replace(/^(\d+) min ago$/, "$1 min temu").replace(/^at (.+)$/, "o $1");
    const POWER = { "charger connected": "ładowarka podłączona", "on battery": "na baterii" };
    const powerPart = p => POWER[p] || p.replace(/^battery (\d+)%/, "bateria $1%")
        .replace(" (charging)", " (ładowanie)").replace(" (full)", " (naładowana)")
        .replace(" (not charging)", " (nie ładuje)");
    const BATT = "battery \\d+%(?: \\((?:charging|full|not charging)\\))?";
    // kioskd writes "1.5 MB/s"; Polish has a decimal comma.
    const comma = s => s.replace(/(\d)\.(\d+)(?= MB\/s)/g, "$1,$2");

    PL.PATTERNS.push(
        // ---- A failed job's title (installer): before "Installing to (.+)"
        [/^(.+): failed$/, (m, t) => `${tr(t)}: błąd`],
        // ---- HMI: a test result and the "not saved" note in one line
        [/^(.+) · Not saved — “Save and open HMI”$/, (m, a) => `${tr(a)} · Niezapisane — „Zapisz i otwórz HMI”`],
        [/^Can't connect to (.+?) \((.*)\)$/, "Brak połączenia z $1 ($2)"],
        [/^Port (\d+) on (.+) answers \((\d+) ms\)$/, "Port $1 na $2 odpowiada ($3 ms)"],

        // ---- Wi-Fi
        [/^secured · (.+) · (\d+)%$/, "zabezpieczona · $1 · $2%"],
        [/^open · (\d+)%$/, "otwarta · $1%"],
        [/^(.+) · signal (\d+)%$/, "$1 · sygnał $2%"],
        [/^signal (\d+)%$/, "sygnał $1%"],
        [/^Connecting to (.+)…$/, "Łączenie z $1…"],
        [/^Disconnecting from (.+)…$/, "Rozłączanie z $1…"],
        [/^Connected to (.+)$/, "Połączono z $1"],
        [/^Couldn't connect to (.+)$/, "Nie udało się połączyć z $1"],
        [/^Removed (.+)$/, "Usunięto $1"],

        // ---- IP
        [/^IP address · (.+)$/, "Adres IP · $1"],
        [/^(.+) · static address$/, "$1 · adres statyczny"],
        [/^(.+) · DHCP address$/, "$1 · adres z DHCP"],

        // ---- Display
        [/^Saving orientation (.*) to the boot settings\. Don't restart the tablet until it's done\.$/,
            "Zapisywanie orientacji $1 w ustawieniach startu. Nie uruchamiaj tabletu ponownie, dopóki to trwa."],
        [/^From the next start, the boot animation uses this orientation \((.*)\)\.$/,
            "Od następnego uruchomienia animacja startowa będzie w tej orientacji ($1)."],
        [/^Now: (.+?)( \(this device's default\))?$/,
            (m, v, d) => `Teraz: ${({ portrait: "pion", landscape: "poziom" })[v] || v}${d ? " (domyślna dla tego urządzenia)" : ""}`],
        [/^Emergency: holding the opposite corner \((.+?)\) for (\d+)\s?s — in the HMI or Settings — opens System → Recovery\.$/,
            (m, c, s) => `Awaryjnie: przytrzymanie przez ${s} s przeciwległego rogu (${tr(c)}) — w HMI i w ustawieniach — otwiera System → Odzyskiwanie.`],

        // ---- System: update, channel
        [/^Downloads the (\S+) channel and switches to it after a restart\.( It may be older\.)?$/,
            (m, c, o) => `Pobierze kanał ${ch(c)}, włączy go po restarcie.${o ? " Może być starszy." : ""}`],
        [/^After a restart: (\S+) channel\.$/, (m, c) => `Po restarcie: kanał ${ch(c)}.`],
        [/^Hold: switch to the (\S+) channel$/, (m, c) => `Przytrzymaj: przejdź na kanał ${ch(c)}`],
        [/^Switching to the (\S+) channel(…?)$/, (m, c, e) => `Przejście na kanał ${ch(c)}${e}`],
        [/^The system is already on the (\S+) channel$/, (m, c) => `System już jest na kanale ${ch(c)}`],
        [/^Switching image to (.+?)(…?)$/, "Zmiana obrazu na $1$2"],
        [/^Update available: (.+)$/, "Dostępna aktualizacja: $1"],
        [/^Version (.+) is waiting for a restart$/, "Wersja $1 czeka na restart"],
        [/^Now running (.+)$/, "Teraz działa $1"],
        [/^(.+?)( \(testing\))? · checked (.+)$/, (m, v, t, a) => `${v}${t ? " (testowa)" : ""} · sprawdzono ${ago(a)}`],
        [/^(\d+) min ago$/, "$1 min temu"],
        [/^Going back to (.+)$/, "Wraca do $1"],
        [/^(.+) is set as the default; (.+) runs until the restart\.$/, "$1 jest ustawiona jako domyślna; do restartu działa $2."],
        [/^Went back to the previous version \((.+)\)\.$/, "Wrócono do poprzedniej ($1)."],
        [/^Went back to (.+) \((.+)\)\.$/, "Wrócono do $1 ($2)."],
        [/^Previous version: (.+)$/, "Poprzednia wersja: $1"],
        [/^Goes back by itself after (\d+) failed starts\. Shortcut: (\d+)\s?s in the (.+?) corner\. Manually: Shift at boot\.$/,
            (m, n, s, c) => `Sama wraca po ${n} nieudanych startach. Skrót: ${s} s w rogu ${tr(c)}. Ręcznie: Shift przy starcie.`],
        [/^Changelog from (.+)$/, "Lista zmian z $1"],
        [/^Host name: (.+?)\. The router will see it on its next connection\.$/,
            "Nazwa hosta: $1. Router zobaczy ją przy następnym połączeniu."],
        [/^Time zone: (.+)$/, "Strefa czasowa: $1"],

        // ---- Boot time
        [/^HMI after (.+) from power-on$/, "HMI po $1 od włączenia"],
        [/^system ready after (.+), (.+) of it before the kernel started \(UEFI \+ GRUB\)$/,
            "system gotowy po $1, z tego $2 przed startem jądra (UEFI + GRUB)"],
        [/^System ready after (.+)$/, "System gotowy po $1"],
        [/^What the boot waited for: (.+)$/, "Na co czekał start: $1"],
        [/^Failed to start: (.+)$/, "Nie uruchomiły się: $1"],
        [/^No boot timeline \(journalctl: (.+)\)$/, "Brak przebiegu startu (journalctl: $1)"],
        [/^Kiosk: cage restarted \(start #(\d+)\)$/, "Kiosk: cage uruchomiony ponownie ($1.)"],
        [/^kiosk-splash: first frame \((.+)\)$/, "kiosk-splash: pierwsza klatka ($1)"],
        [/^(.+): the HMI isn't answering yet, the kiosk will switch to it by itself$/,
            "$1: HMI jeszcze nie odpowiada, kiosk przełączy się na nie samo"],

        // ---- Power (battery tooltip): "charger connected · battery 72% (charging)"
        [new RegExp(`^(?:charger connected|on battery|${BATT})(?: · ${BATT})?$`),
            s => s.split(" · ").map(powerPart).join(" · ")],

        // ---- Installer
        [/^(.+) · (installation drive|too small|internal|external)$/, (m, a, b) => `${a} · ${tr(b)}`],
        [/^The tablet is on battery( \(\d+%\))?\. Plug in the charger before installing\.$/,
            "Tablet działa na baterii$1. Podłącz ładowarkę przed instalacją."],
        [/^Installing to (.+)$/, "Instalacja na $1"],
        [/^Wrote (\d+) B instead of (\d+) B$/, "Zapisano $1 B zamiast $2 B"],

        // ---- kioskd: job steps' details
        [/^New version: (.+)$/, "Nowa wersja: $1"],
        [/^After a restart the system runs image (.+)$/, "Po restarcie system uruchomi obraz $1"],
        [/^([\d.]+) MB · average ([\d.]+) MB\/s$/, (m, a, b) => comma(`${a} MB · średnio ${b} MB/s`)],
        [/^([\d.]+) MB was already on disk$/, "$1 MB było już na dysku"],
        [/^(.+) · about (.+) left$/, (m, a, b) => `${comma(a)} · zostało około ${b}`],

        // ---- kioskd: errors with values
        [/^Already running: (.+)$/, (m, t) => `Trwa już: ${tr(t)}`],
        [/^(.+): timed out \((\d+)\s?s\)$/, "$1: przekroczono czas ($2 s)"],
        [/^program not found: (.+)$/, "brak programu $1"],
        [/^(.+) exited with code (-?\d+)$/, "$1 zakończył się kodem $2"],
        [/^Brightness: (\d+)-100%$/, "Jasność: $1-100%"],
        [/^Invalid DNS server: (.+)$/, "Niepoprawny serwer DNS: $1"],
        [/^Internal error: (.+)$/, "Błąd wewnętrzny: $1"],

        // ---- Most general last
        [/^Version (.+)$/, "Wersja $1"],
        [/^at (\d{1,2}:\d{2})$/, "o $1"],
    );

    return PL;
};
