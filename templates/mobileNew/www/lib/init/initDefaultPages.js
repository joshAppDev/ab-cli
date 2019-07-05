/*
 * initDefaultPages.js
 * Setup the main application Pages
 */
import analytics from "../resources/Analytics.js";

import LoadingPage from "../pages/loadingPage.js";
import PasswordPage from "../pages/password/passwordPage.js";
import AppPage from "../pages/app/appPage.js";

// Initialize the top level pages.
var pages = {
    loading: LoadingPage,
    password: null,
    app: null // will contain all Framework7 sub pages
};

export default {
    init: () => {
        // Setup the Password Page
        try {
            pages.password = new PasswordPage();
        } catch (err) {
            console.log(err);
            $.alert(
                (err.message || "") + "<br />" + (err.stack || ""),
                "Error starting password page"
            );
            analytics.logError(err);
        }

        // Setup our Application Page
        try {
            pages.app = new AppPage();
        } catch (err) {
            console.log(err);
            $.alert(
                (err.message || "") + "<br />" + (err.stack || ""),
                "Error starting app page"
            );
            analytics.logError(err);
        }

        pages.password.on("loading", () => {
            pages.loading.overlay();
        });
        pages.password.on("loadingDone", () => {
            pages.loading.hide();
        });
        pages.password.on("passwordReady", () => {
            // After password is ready, make the main app visible.
            // If there are transparent UI elements on the password page, the main
            // app page will show through under that.
            pages.app.$element.show();
        });
        pages.password.on("passwordDone", () => {
            // Fully show the main app page, and hide the password page.
            pages.app.show();
        });

        return Promise.resolve(); // nothing async, so just return
    },
    show: (pageKey) => {
        if (pages[pageKey]) {
            pages[pageKey].show();
        }
    }
};
