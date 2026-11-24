/* Polish dictionary for i18n.js. EXACT: whole trimmed strings, and
 * templates ("Connected to {name}") of text with values: a string with the
 * same {names}, or a function of the values.
 * New language: a file like this plus a <script> before i18n.js in index.html.
 */
window.I18N_LANGS = window.I18N_LANGS || {};
window.I18N_LANGS.pl = function (tr) {
    "use strict";
    const PL = { EXACT: {} };

    Object.assign(PL.EXACT, {
        // ---- release notes: headings and table headers
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
        "Leave the port empty for the default (443 / 80).": "Puste pole portu = domyślny (443 / 80).",
        "HMI server IP address or name": "Adres IP lub nazwa serwera HMI",
        "e.g. 192.168.1.50": "np. 192.168.1.50",
        "Path": "Ścieżka",
        "Test connection": "Sprawdź połączenie",
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
        "Wi-Fi turns on first. This can take up to a minute.": "Najpierw włączy się Wi-Fi. To może potrwać do minuty.",
        // kioskd: nmcli's errors in plain words (NM_ERRORS)
        "Wrong password": "Błędne hasło",
        "The password must be 8 to 63 characters (or 64 hex digits)":
            "Hasło musi mieć od 8 do 63 znaków (albo 64 cyfry szesnastkowe)",
        "The network is out of range": "Sieć jest poza zasięgiem",
        "No IP address: the network's DHCP server didn't answer":
            "Brak adresu IP: serwer DHCP sieci nie odpowiedział",
        "The connection timed out": "Przekroczono czas łączenia",
        "No cable connected": "Kabel nie jest podłączony",
        "The network service isn't running": "Usługa sieciowa nie działa",
        "No network adapter found": "Nie znaleziono karty sieciowej",
        "Couldn't connect": "Nie udało się połączyć",
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
        "Not connected · these settings are used on its next connection":
            "Niepołączone · te ustawienia zadziałają przy następnym połączeniu",
        "Saving…": "Zapisywanie…",
        "Checking the connection…": "Sprawdzanie połączenia…",
        "The address isn't known on this network": "Ten adres nie jest znany w tej sieci",
        "The server doesn't answer": "Serwer nie odpowiada",
        "The server refuses the connection (wrong port, or the HMI isn't running)":
            "Serwer odrzuca połączenie (zły port albo HMI nie działa)",
        "No route to the server: is the kiosk on its network?": "Brak drogi do serwera: czy kiosk jest w jego sieci?",
        "The server doesn't answer properly": "Serwer nie odpowiada poprawnie",
        "The HMI isn't answering": "HMI nie odpowiada",
        "Settings saved": "Ustawienia zapisane",
        "Applied to the connection.": "Zastosowane w połączeniu.",
        "Used on the next connection to this network.": "Zadziałają przy następnym połączeniu z tą siecią.",
        "Couldn't save the settings": "Nie udało się zapisać ustawień",
        // ---- Resets (each tab)
        "Reset": "Ustawienia domyślne",
        "The HMI's address, behavior and zoom go back to the defaults.":
            "Adres HMI, zachowanie i powiększenie wracają do ustawień domyślnych.",
        "Hold: reset HMI settings": "Przytrzymaj: zresetuj ustawienia HMI",
        "Forgets every saved Wi-Fi network and IP setting. A cable gets its address by DHCP again.":
            "Zapomina wszystkie zapisane sieci Wi-Fi i ustawienia IP. Kabel znów dostanie adres z DHCP.",
        "Hold: reset network settings": "Przytrzymaj: zresetuj ustawienia sieci",
        "Brightness, accent color, orientation, scaling and the Settings corner go back to the defaults.":
            "Jasność, kolor akcentu, orientacja, skalowanie i róg Ustawień wracają do ustawień domyślnych.",
        "Hold: reset display settings": "Przytrzymaj: zresetuj ustawienia ekranu",
        "Resetting…": "Resetowanie…",
        "Back to the defaults": "Przywrócono ustawienia domyślne",
        "Couldn't reset": "Nie udało się zresetować",

        // ---- Display tab
        "Brightness": "Jasność",
        "Accent color": "Kolor akcentu",
        "Settings' buttons and highlights, and the boot screen's bar.": "Przyciski i zaznaczenia w ustawieniach oraz pasek na ekranie startowym.",
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
        "Updating the boot screen…": "Aktualizowanie ekranu startowego…",
        "Boot screen updated": "Ekran startowy zaktualizowany",
        "Couldn't update the boot screen": "Nie udało się zaktualizować ekranu startowego",
        "Saving it to the boot settings. Don't restart the tablet until it's done.":
            "Zapisywanie w ustawieniach rozruchu. Nie uruchamiaj tabletu ponownie, dopóki się nie skończy.",
        "From the next start, the boot screen's bar has this color.":
            "Od następnego uruchomienia pasek na ekranie startowym ma ten kolor.",
        "From the next start, the boot screen speaks this language.":
            "Od następnego uruchomienia ekran startowy jest w tym języku.",
        "Scaling": "Skalowanie",
        "Scaling enlarges everything: the HMI, Settings and the keyboard. HMI zoom (HMI tab) is multiplied by it.":
            "Skalowanie powiększa wszystko: HMI, ustawienia i klawiaturę. Powiększenie HMI (zakładka HMI) mnoży się przez tę wartość.",
        "Default": "Domyślna",
        "Opening Settings from the HMI": "Wejście do ustawień z HMI",
        "Hold the chosen screen corner for about 1 s.": "Przytrzymaj ok. 1 s wybrany róg ekranu.",
        "↖ Top left": "↖ Lewy górny",
        "↗ Top right": "↗ Prawy górny",
        "↙ Bottom left": "↙ Lewy dolny",
        "↘ Bottom right": "↘ Prawy dolny",

        // ---- System tab: system, update, channel, custom image
        "Updates": "Aktualizacja",
        "Update": "Aktualizuj",
        "Hold: restart now": "Przytrzymaj: uruchom ponownie teraz",
        "Check for updates": "Sprawdź aktualizacje",
        "none": "brak",
        "Stable": "Stabilny",
        "Testing (dev)": "Testowy (dev)",
        "Stable: tested releases. Testing: every change right away. Hold a channel to switch to it.":
            "Stabilny: sprawdzone wydania. Testowy: każda zmiana od razu. Przytrzymaj kanał, by na niego przejść.",
        "Custom image: hold a channel to get updates again.": "Własny obraz: przytrzymaj kanał, by wrócić do aktualizacji.",
        "Stable: tested releases, may be older than this one. Hold it to switch.":
            "Stabilny: sprawdzone wydania, może być starszy od tej wersji. Przytrzymaj, by przejść.",
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
        "Usage": "Wykorzystanie",
        "Temperature": "Temperatura",
        "{cores} cores": v => `${v.cores} ${v.cores === 1 ? "rdzeń"
            : [2, 3, 4].includes(v.cores % 10) && ![12, 13, 14].includes(v.cores % 100) ? "rdzenie" : "rdzeni"}`,
        "average {pct}% (last minute)": "średnio {pct}% (minuta)",
        "Usage details": "Szczegóły wykorzystania",
        "High usage ({at}% / {at} °C and up)": "Wysokie obciążenie (od {at}% / {at} °C)",
        "None so far.": "Jak dotąd brak.",
        "Hold: clear the list": "Przytrzymaj: wyczyść listę",
        "{n} s": "{n} s",
        "{n} min": "{n} min",
        "going on, {d}": "trwa, {d}",
        "Most: {list}": "Najwięcej: {list}",
        "Then: processor {cpu}% · {temp} °C · memory {mem}% · swap {swap}%":
            "Wtedy: procesor {cpu}% · {temp} °C · pamięć {mem}% · swap {swap}%",
        "highest {t} °C": "najwyżej {t} °C",
        "{free} free": "{free} wolne",
        "{packed} MB in memory": "{packed} MB w pamięci",
        "Update channel and image": "Kanał aktualizacji i obraz systemu",
        "Boot time": "Czas uruchamiania",
        "Boot details": "Szczegóły startu",
        "System details": "Szczegóły systemu",
        "Boot timeline (seconds since kernel start)": "Przebieg startu (sekundy od startu jądra)",
        "Slowest-starting services": "Najdłużej startujące usługi",
        "Loading boot time…": "Wczytywanie czasu uruchamiania…",
        "Reading this boot's journal": "Czytam dziennik tego startu",
        "No boot data": "Brak danych o starcie",
        "No HMI address at boot: HMI time not measured":
            "Brak adresu HMI przy starcie: czas do HMI nie jest mierzony",
        "The HMI hasn't shown yet (no address, or the server isn't answering)":
            "HMI jeszcze się nie wyświetliło (brak adresu albo serwer nie odpowiada)",
        "Still booting": "Start jeszcze trwa",
        "Kernel": "Jądro",
        "Services": "Usługi",
        "HMI visible": "HMI widoczne",

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
        "The system restarts into the previous version": "System uruchomi się ponownie w poprzedniej wersji",
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
    });

    // ---- Templates: text with {values} (i18n.t), the page's and kioskd's
    // (Msg). A string keeps the {names}; a function gets the values as they
    // are, for values that need a word of their own (channel names).
    const CHANNEL = { stable: "stabilny", testing: "testowy", custom: "własny" };
    const ch = n => CHANNEL[n] || n;
    // kioskd writes "1.5"; Polish has a decimal comma.
    const comma = s => String(s).replace(".", ",");
    const ROTATION = { portrait: "pion", landscape: "poziom" };

    Object.assign(PL.EXACT, {
        // ---- Values that are words
        "charger connected": "ładowarka podłączona",
        "on battery": "na baterii",
        "battery {pct}%": "bateria {pct}%",
        "battery {pct}% (charging)": "bateria {pct}% (ładowanie)",
        "battery {pct}% (full)": "bateria {pct}% (naładowana)",
        "battery {pct}% (not charging)": "bateria {pct}% (nie ładuje)",
        "{n} min ago": "{n} min temu",
        "at {time}": "o {time}",
        "{title}…": "{title}…",
        "{title}: failed": "{title}: błąd",
        // System errors inside kioskd's messages (English: LC_MESSAGES)
        "Connection refused": "Połączenie odrzucone",
        "No route to host": "Brak trasy do hosta",
        "Network is unreachable": "Sieć jest nieosiągalna",
        "Name or service not known": "Nieznana nazwa hosta",
        "Temporary failure in name resolution": "Nie można teraz rozwiązać nazwy",
        "timed out": "przekroczono czas",

        // ---- HMI check (kioskd hmi_watch)
        "The HMI answers ({ms} ms)": "HMI odpowiada ({ms} ms)",
        "The server answers {status}: the HMI behind it isn't running":
            "Serwer odpowiada błędem {status}: wizualizacja za nim nie działa",

        // ---- Wi-Fi
        "secured · {security} · {signal}%": "zabezpieczona · {security} · {signal}%",
        "open · {signal}%": "otwarta · {signal}%",
        "{name} · signal {signal}%": "{name} · sygnał {signal}%",
        "signal {signal}%": "sygnał {signal}%",
        "Connecting to {name}…": "Łączenie z {name}…",
        "Disconnecting from {name}…": "Rozłączanie z {name}…",
        "Connected to {name}": "Połączono z {name}",
        "Couldn't connect to {name}": "Nie udało się połączyć z {name}",
        "Removed {name}": "Usunięto {name}",
        "Network “{ssid}” not found": "Nie znaleziono sieci „{ssid}”",
        "Couldn't connect: {reason}": "Nie udało się połączyć: {reason}",

        // ---- IP
        "IP address · {kind}": "Adres IP · {kind}",
        "{addresses} · static address": "{addresses} · adres statyczny",
        "{addresses} · DHCP address": "{addresses} · adres z DHCP",
        "Static address · {address}": "Statyczny adres · {address}",
        "IP settings: tap the network under Saved networks.": "Ustawienia IP: dotknij sieci w Zapisanych sieciach.",
        "Invalid DNS server: {dns}": "Niepoprawny serwer DNS: {dns}",

        // ---- Display
        "Saving orientation {o} to the boot settings. Don't restart the tablet until it's done.":
            "Zapisywanie orientacji {o} w ustawieniach startu. Nie uruchamiaj tabletu ponownie, dopóki to trwa.",
        "From the next start, the boot animation uses this orientation ({o}).":
            "Od następnego uruchomienia animacja startowa będzie w tej orientacji ({o}).",
        "Now: {rotation}": v => `Teraz: ${ROTATION[v.rotation] || v.rotation}`,
        "Now: {rotation} (this device's default)":
            v => `Teraz: ${ROTATION[v.rotation] || v.rotation} (domyślna dla tego urządzenia)`,
        "Brightness: {min}-100%": "Jasność: {min}-100%",

        // ---- System: update, channel
        "After a restart: {channel} channel.": v => `Po restarcie: kanał ${ch(v.channel)}.`,
        "Switching to the {channel} channel": v => `Przejście na kanał ${ch(v.channel)}`,
        "The system is already on the {channel} channel": v => `System już jest na kanale ${ch(v.channel)}`,
        "Switching image to {image}": "Zmiana obrazu na {image}",
        "Update available: {version}": "Dostępna aktualizacja: {version}",
        "Version {version} is waiting for a restart": "Wersja {version} czeka na restart",
        "Version {version}": "Wersja {version}",
        "Now running {version}": "Teraz działa {version}",
        "Now running {version}.": "Teraz działa {version}.",
        "{version} · checked {ago}": "{version} · sprawdzono {ago}",
        "{version} (testing) · checked {ago}": "{version} (testowa) · sprawdzono {ago}",
        "Going back to {version}": "Wraca do {version}",
        "{rollback} is set as the default; {booted} runs until the restart.":
            "{rollback} jest ustawiona jako domyślna; do restartu działa {booted}.",
        "Went back to the previous version ({time}).": "Wrócono do poprzedniej ({time}).",
        "Went back to {version} ({time}).": "Wrócono do {version} ({time}).",
        "Previous version: {version}": "Poprzednia wersja: {version}",
        "Goes back by itself after {n} failed starts. Manually: Shift at boot.":
            "Sama wraca po {n} nieudanych startach. Ręcznie: Shift przy starcie.",
        "Changelog from {repo}": "Lista zmian z {repo}",
        "Host name: {name}. The router will see it on its next connection.":
            "Nazwa hosta: {name}. Router zobaczy ją przy następnym połączeniu.",
        "Time zone: {zone}": "Strefa czasowa: {zone}",

        // ---- Boot time
        "HMI after {time} from power-on": "HMI po {time} od włączenia",
        "system ready after {ready}, {before} of it before the kernel started (UEFI + GRUB)":
            "system gotowy po {ready}, z tego {before} przed startem jądra (UEFI + GRUB)",
        "System ready after {time}": "System gotowy po {time}",
        "What the boot waited for: {title}": "Na co czekał start: {title}",
        "file systems mounted (local-fs)": "do zamontowania systemów plików (local-fs)",
        "the kiosk starting (cage)": "do startu kiosku (cage)",
        "Failed to start: {units}": "Nie uruchomiły się: {units}",
        "No boot timeline (journalctl: {error})": "Brak przebiegu startu (journalctl: {error})",
        "Kiosk: cage restarted (start #{n})": "Kiosk: cage uruchomiony ponownie ({n}.)",

        // ---- Installer
        "The tablet is on battery. Plug in the charger before installing.":
            "Tablet działa na baterii. Podłącz ładowarkę przed instalacją.",
        "The tablet is on battery ({pct}%). Plug in the charger before installing.":
            "Tablet działa na baterii ({pct}%). Podłącz ładowarkę przed instalacją.",
        "Installing to {disk}": "Instalacja na {disk}",
        "Wrote {written} B instead of {size} B": "Zapisano {written} B zamiast {size} B",

        // ---- kioskd: job steps' details
        "New version: {version}": "Nowa wersja: {version}",
        "After a restart the system runs image {image}": "Po restarcie system uruchomi obraz {image}",
        "{done} / {total} MB": "{done} / {total} MB",
        "{done} / {total} MB · {rate} MB/s · about {eta} left":
            v => `${v.done} / ${v.total} MB · ${comma(v.rate)} MB/s · zostało około ${v.eta}`,
        "{total} MB": "{total} MB",
        "{total} MB · average {rate} MB/s": v => `${v.total} MB · średnio ${comma(v.rate)} MB/s`,
        "{mb} MB was already on disk": "{mb} MB było już na dysku",

        // ---- kioskd: errors with values
        "Already running: {title}": "Trwa już: {title}",
        "{program}: timed out ({secs} s)": "{program}: przekroczono czas ({secs} s)",
        "program not found: {program}": "brak programu {program}",
        "{program} exited with code {code}": "{program} zakończył się kodem {code}",
        "Internal error: {error}": "Błąd wewnętrzny: {error}",
    });

    return PL;
};
